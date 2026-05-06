import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  assertForemanCanAccessProject,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { downloadFromR2 } from "@/lib/foreman/r2";
import { parseExpenseText } from "@/lib/ai/parse-expense-text";
import { classifyExpenseImage } from "@/lib/ai/classify-expense-image";
import { ocrReceiptStructured } from "@/lib/ocr/receipt-ocr";
import { parseExcelEstimate } from "@/lib/parsers/excel-estimate-parser";
import { mergeForemanItems, fromParsedExpense, type ForemanDraftItem } from "@/lib/foreman/merge-items";
import type { CostType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  projectId: z.string().min(1),
  text: z.string().max(10_000).optional().default(""),
  occurredAt: z.string().min(1),
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

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}
function isPdf(mime: string): boolean {
  return mime === "application/pdf";
}
function isExcel(mime: string, name: string): boolean {
  if (
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return true;
  return /\.(xlsx|xls)$/i.test(name);
}

export async function POST(req: NextRequest) {
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request", message: "Невалідні параметри" }, { status: 400 });
  }
  const { projectId, text, occurredAt, fileKeys } = parsed.data;

  try {
    await assertForemanCanAccessProject(session.user.id, firmId, projectId);
  } catch {
    return forbiddenResponse();
  }

  const occurredAtDate = new Date(occurredAt);
  if (isNaN(occurredAtDate.getTime())) {
    return NextResponse.json({ error: "Bad request", message: "Невалідна дата" }, { status: 400 });
  }

  // 1. Створити DRAFT report + attachments
  const report = await prisma.foremanReport.create({
    data: {
      projectId,
      firmId,
      createdById: session.user.id,
      status: "DRAFT",
      rawText: text || null,
      occurredAt: occurredAtDate,
      currency: "UAH",
      attachments: {
        create: fileKeys.map((f) => ({
          r2Key: f.key,
          originalName: f.originalName,
          mimeType: f.mime,
          size: f.size,
          uploadedById: session.user.id,
        })),
      },
    },
    select: { id: true },
  });

  // 2. Запустити паралельно AI-парсери
  const sources: ForemanDraftItem[][] = [];
  const aiRaw: Record<string, unknown> = {};

  const tasks: Array<Promise<void>> = [];

  if (text.trim().length > 0) {
    tasks.push(
      (async () => {
        try {
          const items = await parseExpenseText(text);
          aiRaw.text = items;
          sources.push(items.map(fromParsedExpense));
        } catch (e) {
          console.warn("[foreman/parse] parseExpenseText failed:", e);
          aiRaw.textError = (e as Error).message;
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
            aiRaw[`img:${f.key}`] = { type: cls.type, summary: cls.summary, totalAmount: cls.totalAmount, items: cls.items };
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
            aiRaw[`pdf:${f.key}`] = ocr.parsed;
            sources.push(
              ocr.parsed.items.map((it) => ({
                costType: "MATERIAL" as CostType,
                title: it.name,
                unit: it.unit,
                quantity: it.quantity ?? null,
                unitPrice: it.unitPrice ?? null,
                amount: it.totalPrice ?? (it.quantity && it.unitPrice ? it.quantity * it.unitPrice : 0),
                currency: ocr.parsed.currency || "UAH",
                confidence: 0.7,
              })).filter((it) => it.amount > 0),
            );
          } else if (isExcel(f.mime, f.originalName)) {
            const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
            const xls = await parseExcelEstimate(ab);
            aiRaw[`xls:${f.key}`] = { items: xls.items.length, errors: xls.errors };
            sources.push(
              xls.items.map((it) => ({
                costType: "MATERIAL" as CostType,
                title: it.description,
                unit: it.unit,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                amount: it.totalPrice,
                currency: "UAH",
                confidence: 0.8,
              })).filter((it) => it.amount > 0),
            );
          }
        } catch (e) {
          console.warn(`[foreman/parse] file ${f.key} failed:`, e);
          aiRaw[`error:${f.key}`] = (e as Error).message;
        }
      })(),
    );
  }

  await Promise.all(tasks);

  // 3. Merge + dedupe
  const merged = mergeForemanItems(sources);

  // 4. Зберегти items + raw json
  if (merged.length > 0) {
    await prisma.foremanReportItem.createMany({
      data: merged.map((it, idx) => ({
        reportId: report.id,
        costType: it.costType,
        title: it.title,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: it.amount,
        currency: it.currency,
        confidence: it.confidence,
        sortOrder: idx,
      })),
    });
  }

  await prisma.foremanReport.update({
    where: { id: report.id },
    data: { aiResultJson: aiRaw as object },
  });

  const items = await prisma.foremanReportItem.findMany({
    where: { reportId: report.id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ reportId: report.id, items });
}
