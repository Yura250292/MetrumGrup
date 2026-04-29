import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { FINANCE_CATEGORIES } from "@/lib/constants";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { matchCounterparties } from "@/lib/financing/counterparty-match";
import { tryDeterministicParse } from "@/lib/financing/import/deterministic-parse";

export const runtime = "nodejs";
export const maxDuration = 300;

const WRITE_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ROWS_PER_BATCH = 200;
const MAX_TOTAL_ROWS = 1000;

type ImportType = "INCOME" | "EXPENSE" | "AUTO";

type ParsedRow = {
  occurredAt: string | null;
  title: string;
  amount: number;
  category: string;
  counterparty: string | null;
  description: string | null;
  /** Лише для AUTO режиму — детектиться по знаку amount у джерелі. */
  direction?: "INCOME" | "EXPENSE";
  sourceRow: number;
  /** Заповнюється сервером після fuzzy-match по таблиці Counterparty. */
  counterpartyId?: string;
  counterpartyResolved?: string;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !WRITE_ROLES.has(role)) return forbiddenResponse();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY не налаштований" },
      { status: 500 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const typeParam = String(form.get("type") ?? "");
  const importType: ImportType =
    typeParam === "INCOME" || typeParam === "EXPENSE" || typeParam === "AUTO"
      ? typeParam
      : "EXPENSE";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передано" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `Файл завеликий (макс ${MAX_FILE_BYTES / 1024 / 1024} МБ)` },
      { status: 400 },
    );
  }

  const lower = file.name.toLowerCase();
  if (!/\.(xlsx|xls|csv)$/.test(lower)) {
    return NextResponse.json(
      { error: "Підтримуються .xlsx / .xls / .csv" },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: "buffer", cellDates: true, cellNF: false });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Не вдалося прочитати файл: ${e.message}`
            : "Не вдалося прочитати файл",
      },
      { status: 400 },
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json({ error: "Файл не містить аркушів" }, { status: 400 });
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });

  if (matrix.length < 2) {
    return NextResponse.json(
      { error: "У файлі немає даних (потрібен хоча б один рядок крім шапки)" },
      { status: 400 },
    );
  }

  // 1. Пробуємо детермінований парсер по словнику синонімів. Якщо вдається —
  //    взагалі не дзвонимо AI: безкоштовно і 100% точно.
  const det = tryDeterministicParse(matrix, importType);
  if (det) {
    const totalRowsInFile = matrix.length - 1;
    const cleaned = det.rows.slice(0, MAX_TOTAL_ROWS);
    const truncated = det.rows.length > MAX_TOTAL_ROWS;

    const uniqueCounterpartyNames = cleaned
      .map((r) => r.counterparty)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    const matches = await matchCounterparties(uniqueCounterpartyNames);
    const enriched = cleaned.map((r) => {
      if (r.counterparty) {
        const hit = matches.get(r.counterparty);
        if (hit) {
          return {
            ...r,
            counterpartyId: hit.id,
            counterpartyResolved: hit.name,
          };
        }
      }
      return r;
    });

    return NextResponse.json({
      rows: enriched,
      notes: det.notes,
      truncated,
      totalRowsInFile,
      sheetName,
      fileName: file.name,
      matchedCounterparties: matches.size,
      mode: "deterministic" as const,
      detectedHeaders: det.matchedHeaders,
    });
  }

  // 2. Fallback на AI: шапка не розпізнана детерміновано, передаємо файл Claude.
  const header = matrix[0];
  const dataRows = matrix.slice(1);
  const totalRowsInFile = dataRows.length;
  const truncated = totalRowsInFile > MAX_TOTAL_ROWS;
  const dataToProcess = truncated ? dataRows.slice(0, MAX_TOTAL_ROWS) : dataRows;

  // Категорії: для AUTO дозволяємо всі (income+expense), бо рядки можуть бути різні.
  const allowedCategories =
    importType === "AUTO"
      ? FINANCE_CATEGORIES
      : FINANCE_CATEGORIES.filter((c) => c.applicableTo === importType);
  const allowedKeys: string[] = allowedCategories.map((c) => c.key);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 90_000,
  });

  // Розбиваємо на батчі по ROWS_PER_BATCH і викликаємо AI послідовно.
  const allRows: ParsedRow[] = [];
  const allNotes: string[] = [];

  for (let offset = 0; offset < dataToProcess.length; offset += ROWS_PER_BATCH) {
    const batch = dataToProcess.slice(offset, offset + ROWS_PER_BATCH);
    const batchMatrix = [header, ...batch];
    const tsv = batchMatrix
      .map((row) =>
        row
          .map((c) => (c === null || c === undefined ? "" : String(c).replace(/\t/g, " ")))
          .join("\t"),
      )
      .join("\n");

    const systemPrompt = buildSystemPrompt(importType, allowedKeys);
    const tool = buildTool(importType, allowedKeys);

    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        temperature: 0,
        system: systemPrompt,
        tools: [tool],
        tool_choice: { type: "tool", name: "extract_finance_rows" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Sheet "${sheetName}" — batch ${offset / ROWS_PER_BATCH + 1} of ${Math.ceil(dataToProcess.length / ROWS_PER_BATCH)} (rows ${offset + 1}–${offset + batch.length} of ${dataToProcess.length}). Type=${importType}.\n\n--- TSV START ---\n${tsv}\n--- TSV END ---`,
              },
            ],
          },
        ],
      });

      const block = message.content.find((b) => b.type === "tool_use") as
        | Anthropic.ToolUseBlock
        | undefined;
      if (!block) {
        allNotes.push(`Batch ${offset + 1}: AI не повернув структуру`);
        continue;
      }
      const input = block.input as { rows?: unknown[]; notes?: unknown[] };
      const rawRows = Array.isArray(input.rows) ? (input.rows as ParsedRow[]) : [];
      // Зміщуємо sourceRow на offset, щоб в UI були реальні номери рядків.
      for (const r of rawRows) {
        if (r && typeof r.sourceRow === "number") {
          r.sourceRow = r.sourceRow + offset;
        }
        allRows.push(r);
      }
      if (Array.isArray(input.notes)) {
        for (const n of input.notes) {
          if (typeof n === "string") allNotes.push(n);
        }
      }
    } catch (err) {
      console.error("[financing/import/parse] AI batch error:", err);
      allNotes.push(
        `Batch ${offset + 1}: ${err instanceof Error ? err.message : "AI помилка"}`,
      );
    }
  }

  // Sanitize.
  const allowedSet: Set<string> = new Set(allowedKeys);
  const cleaned: ParsedRow[] = allRows
    .filter((r) => {
      if (!r) return false;
      if (typeof r.title !== "string" || !r.title.trim()) return false;
      if (typeof r.amount !== "number" || !Number.isFinite(r.amount)) return false;
      if (importType !== "AUTO" && r.amount <= 0) return false;
      if (!allowedSet.has(r.category)) return false;
      return true;
    })
    .map<ParsedRow>((r) => {
      // У AUTO режимі зберігаємо знак як direction, а amount робимо абсолютним.
      const direction: "INCOME" | "EXPENSE" =
        importType === "AUTO"
          ? r.amount >= 0
            ? "INCOME"
            : "EXPENSE"
          : (importType as "INCOME" | "EXPENSE");
      const absAmount = Math.abs(r.amount);
      return {
        sourceRow: typeof r.sourceRow === "number" ? r.sourceRow : 0,
        occurredAt:
          typeof r.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.occurredAt)
            ? r.occurredAt
            : null,
        title: r.title.trim().slice(0, 200),
        amount: Math.round(absAmount * 100) / 100,
        category: r.category,
        counterparty:
          typeof r.counterparty === "string" && r.counterparty.trim()
            ? r.counterparty.trim().slice(0, 200)
            : null,
        description:
          typeof r.description === "string" && r.description.trim()
            ? r.description.trim().slice(0, 1000)
            : null,
        direction: importType === "AUTO" ? direction : undefined,
      };
    });

  // Counterparty fuzzy-match — один запит у БД на унікальні імена.
  const uniqueCounterpartyNames = cleaned
    .map((r) => r.counterparty)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  const matches = await matchCounterparties(uniqueCounterpartyNames);
  for (const r of cleaned) {
    if (r.counterparty) {
      const hit = matches.get(r.counterparty);
      if (hit) {
        r.counterpartyId = hit.id;
        r.counterpartyResolved = hit.name;
      }
    }
  }

  return NextResponse.json({
    rows: cleaned,
    notes: allNotes,
    truncated,
    totalRowsInFile,
    sheetName,
    fileName: file.name,
    matchedCounterparties: matches.size,
    mode: "ai" as const,
  });
}

function buildSystemPrompt(importType: ImportType, allowedKeys: string[]) {
  const base = [
    "You extract financial entries from a spreadsheet.",
    "The first row is usually a header. Column order varies — infer mapping from header names AND values.",
    "Skip totals/subtotals/empty rows. Skip the header itself.",
    "Each output row MUST contain a positive amount (> 0), a non-empty title and a date if you can infer one.",
    "amount: parse Ukrainian/European format ('25 500,50' = 25500.5). Strip currency symbols.",
    "occurredAt: ISO yyyy-mm-dd. If only month or year — pick first of that period. If unknown — null.",
    "title: short human description (≤120 chars).",
    "counterparty: payer/payee name if a separate column exists; otherwise null.",
    "description: longer notes if present, otherwise null.",
  ];
  if (importType === "AUTO") {
    base.push(
      "This is a BANK STATEMENT. Each row may be income OR expense.",
      "PRESERVE THE SIGN of the amount: negative for outgoing/expense, positive for incoming/income.",
      "If the sheet has separate 'Списано'/'Зараховано' columns — output negative for the first, positive for the second.",
      `category: one of these keys (mix of income & expense allowed): ${allowedKeys.join(", ")}.`,
    );
  } else {
    base.push(
      "amount must be positive. Drop rows where amount cannot be parsed as positive.",
      `category: one of these keys for type=${importType}: ${allowedKeys.join(", ")}.`,
    );
  }
  base.push("Return ALL data rows. Do not invent rows that are not in the input.");
  return base.join("\n");
}

function buildTool(importType: ImportType, allowedKeys: string[]): Anthropic.Tool {
  return {
    name: "extract_finance_rows",
    description:
      "Extract structured financial entries from the supplied TSV spreadsheet content.",
    input_schema: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sourceRow: {
                type: "integer",
                description: "1-based source row index inside this batch (skip header)",
              },
              occurredAt: { type: ["string", "null"], description: "ISO yyyy-mm-dd or null" },
              title: { type: "string" },
              amount: {
                type: "number",
                description:
                  importType === "AUTO"
                    ? "Signed amount: negative=expense, positive=income"
                    : "Positive amount",
              },
              category: { type: "string", enum: allowedKeys },
              counterparty: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
            },
            required: ["sourceRow", "title", "amount", "category"],
            additionalProperties: false,
          },
        },
        notes: {
          type: "array",
          items: { type: "string" },
          description: "Optional warnings about ambiguous rows or columns.",
        },
      },
      required: ["rows"],
      additionalProperties: false,
    },
  };
}
