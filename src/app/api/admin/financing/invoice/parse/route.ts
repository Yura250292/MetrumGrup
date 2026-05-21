import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  forbiddenResponse,
  unauthorizedResponse,
  SUPPLIER_LEDGER_ROLES,
} from "@/lib/auth-utils";
import {
  getActiveRoleFromSession,
  isHomeFirmFor,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { downloadFromR2 } from "@/lib/foreman/r2";
import { parseExpenseText } from "@/lib/ai/parse-expense-text";
import { classifyExpenseImage } from "@/lib/ai/classify-expense-image";
import { ocrReceiptStructured } from "@/lib/ocr/receipt-ocr";
import { parseExcelEstimate } from "@/lib/parsers/excel-estimate-parser";
import { parseKB2ActExcel } from "@/lib/parsers/kb2-act-parser";
import {
  mergeForemanItems,
  fromParsedExpense,
  type ForemanDraftItem,
} from "@/lib/foreman/merge-items";
import { resolveSuppliersBulk } from "@/lib/foreman/resolve-supplier";
import type { CostType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().max(10_000).optional().default(""),
  fileKeys: z
    .array(
      z.object({
        key: z.string().min(1),
        mime: z.string().min(1),
        originalName: z.string().min(1),
        size: z.number().int().nonnegative(),
      }),
    )
    .max(5)
    .optional()
    .default([]),
});

function isImage(mime: string) {
  return mime.startsWith("image/");
}
function isPdf(mime: string) {
  return mime === "application/pdf";
}
function isExcel(mime: string, name: string) {
  if (
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return true;
  return /\.(xlsx|xls)$/i.test(name);
}

/**
 * Парсинг тексту + файлів накладної (без створення FinanceEntry).
 * Аналог foreman parse, але повертає лише draft items для попереднього перегляду.
 * UI потім дає підтвердити/підправити позиції перед фінальним submit batch endpoint.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !SUPPLIER_LEDGER_ROLES.includes(role)) return forbiddenResponse();

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { text, fileKeys } = parsed.data;

  if (!text.trim() && fileKeys.length === 0) {
    return NextResponse.json({ items: [], suggestions: {} });
  }

  const sources: ForemanDraftItem[][] = [];
  const tasks: Array<Promise<void>> = [];

  if (text.trim().length > 0) {
    tasks.push(
      (async () => {
        try {
          const items = await parseExpenseText(text);
          sources.push(items.map(fromParsedExpense));
        } catch (e) {
          console.warn("[invoice/parse] parseExpenseText failed:", e);
        }
      })(),
    );
  }

  for (const f of fileKeys) {
    tasks.push(
      (async () => {
        try {
          const buf = await downloadFromR2(f.key);
          if (isImage(f.mime)) {
            const cls = await classifyExpenseImage(buf, f.mime);
            if (cls.type === "expense_table") {
              sources.push(cls.items.map(fromParsedExpense));
            } else if (cls.type === "expense_total_only" && cls.totalAmount) {
              sources.push([
                {
                  costType: "MATERIAL" as CostType,
                  title: cls.summary || "Витрата (підсумок з фото)",
                  unit: null,
                  quantity: null,
                  unitPrice: null,
                  amount: cls.totalAmount,
                  currency: "UAH",
                  confidence: 0.5,
                },
              ]);
            }
          } else if (isPdf(f.mime)) {
            const ocr = await ocrReceiptStructured(buf, f.mime);
            sources.push(
              ocr.parsed.items
                .map((it) => ({
                  costType: "MATERIAL" as CostType,
                  title: it.name,
                  unit: it.unit,
                  quantity: it.quantity ?? null,
                  unitPrice: it.unitPrice ?? null,
                  amount:
                    it.totalPrice ??
                    (it.quantity && it.unitPrice ? it.quantity * it.unitPrice : 0),
                  currency: ocr.parsed.currency || "UAH",
                  confidence: 0.7,
                }))
                .filter((it) => it.amount > 0),
            );
          } else if (isExcel(f.mime, f.originalName)) {
            const ab = buf.buffer.slice(
              buf.byteOffset,
              buf.byteOffset + buf.byteLength,
            ) as ArrayBuffer;
            let estimateItems: ForemanDraftItem[] = [];
            try {
              const xls = await parseExcelEstimate(ab);
              estimateItems = xls.items
                .map((it) => ({
                  costType: "MATERIAL" as CostType,
                  title: it.description,
                  unit: it.unit,
                  quantity: it.quantity,
                  unitPrice: it.unitPrice,
                  amount: it.totalPrice,
                  currency: "UAH",
                  confidence: 0.8,
                }))
                .filter((it) => it.amount > 0);
            } catch {
              // fall through to KB2 try
            }
            if (estimateItems.length === 0) {
              const kb2Items = parseKB2ActExcel(ab);
              if (kb2Items.length > 0) {
                sources.push(kb2Items);
              }
            } else {
              sources.push(estimateItems);
            }
          }
        } catch (e) {
          console.warn(`[invoice/parse] file ${f.key} failed:`, e);
        }
      })(),
    );
  }

  await Promise.all(tasks);

  const merged = mergeForemanItems(sources);

  // Resolve supplier: повертаємо лише suggestion, без авто-binding.
  // UI вирішує що з ним робити (підтвердити/створити нового).
  const resolutions = await resolveSuppliersBulk({
    firmId: firmId ?? null,
    guesses: merged.map((it) => ({ guess: it.supplier ?? null })),
  });

  // Найчастіший resolved counterpartyId — пропонуємо як header.
  // supplierGuess (raw текст від AI) — fallback якщо нічого не змаппилось.
  const counterpartyCounts = new Map<string, number>();
  let guessName: string | null = null;
  for (let i = 0; i < merged.length; i++) {
    const r = resolutions[i];
    if (r?.counterpartyId) {
      counterpartyCounts.set(
        r.counterpartyId,
        (counterpartyCounts.get(r.counterpartyId) ?? 0) + 1,
      );
    } else if (r?.supplierGuess) {
      guessName = guessName ?? r.supplierGuess;
    }
  }
  const topCounterpartyId = Array.from(counterpartyCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0] ?? null;

  return NextResponse.json({
    items: merged.map((it, idx) => ({
      ...it,
      resolvedSupplierId: resolutions[idx]?.counterpartyId ?? null,
    })),
    suggestions: {
      counterpartyId: topCounterpartyId,
      // UI підтягне назву з combobox-options
      supplierGuess: guessName,
    },
  });
}
