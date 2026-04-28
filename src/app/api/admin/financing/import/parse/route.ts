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

export const runtime = "nodejs";
// Streaming + AI call can take a while on large sheets.
export const maxDuration = 120;

const WRITE_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 МБ
const MAX_ROWS_TO_AI = 200;

type ImportType = "INCOME" | "EXPENSE";

type ParsedRow = {
  /** ISO yyyy-mm-dd or null if unparsable */
  occurredAt: string | null;
  title: string;
  amount: number;
  category: string;
  counterparty: string | null;
  description: string | null;
  /** Original index in source sheet (1-based, after header) — debug only */
  sourceRow: number;
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
    typeParam === "INCOME" ? "INCOME" : "EXPENSE";

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

  // 1. Parse spreadsheet locally — деталі по рядках без AI
  const buf = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: "buffer", cellDates: true, cellNF: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `Не вдалося прочитати файл: ${e.message}` : "Не вдалося прочитати файл" },
      { status: 400 },
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json({ error: "Файл не містить аркушів" }, { status: 400 });
  }
  const sheet = workbook.Sheets[sheetName];
  // Header: 1 → масиви рядків (не намагається вгадувати поля). raw: false → ISO дати як рядки.
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

  // Шапку відрізаємо лише для контексту AI; у відповіді даємо весь блок як TSV.
  const truncated = matrix.length > MAX_ROWS_TO_AI + 1; // +1 — header
  const aiMatrix = truncated ? matrix.slice(0, MAX_ROWS_TO_AI + 1) : matrix;
  const tsv = aiMatrix
    .map((row) =>
      row
        .map((c) => (c === null || c === undefined ? "" : String(c).replace(/\t/g, " ")))
        .join("\t"),
    )
    .join("\n");

  // 2. Anthropic structured-output виклик
  const allowedCategories = FINANCE_CATEGORIES.filter(
    (c) => c.applicableTo === importType,
  );
  const allowedKeys = allowedCategories.map((c) => c.key);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 90_000,
  });

  const systemPrompt = [
    "You extract financial entries from a spreadsheet.",
    "The first row is usually a header. Column order varies — infer mapping from header names AND values.",
    "Skip totals/subtotals/empty rows. Skip the header itself.",
    "Each output row MUST contain a positive amount, a non-empty title and a date if you can infer one.",
    "amount: parse Ukrainian/European format ('25 500,50' = 25500.5). Strip currency symbols.",
    "occurredAt: ISO yyyy-mm-dd. If only month or year — pick first of that period. If unknown — null.",
    "title: short human description (≤120 chars).",
    "counterparty: payer/payee name if a separate column exists; otherwise null.",
    "description: longer notes if present, otherwise null.",
    `category: one of these keys for type=${importType}: ${allowedKeys.join(", ")}.`,
    "Return ALL data rows. Do not invent rows that are not in the input.",
  ].join("\n");

  const tool: Anthropic.Tool = {
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
              sourceRow: { type: "integer", description: "1-based source row index (skip header)" },
              occurredAt: {
                type: ["string", "null"],
                description: "ISO yyyy-mm-dd or null",
              },
              title: { type: "string" },
              amount: { type: "number" },
              category: {
                type: "string",
                enum: allowedKeys,
              },
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

  let extracted: { rows: ParsedRow[]; notes: string[] };
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
              text: `Sheet "${sheetName}", ${matrix.length - 1} data rows (showing ${aiMatrix.length - 1}${truncated ? " — TRUNCATED" : ""}). Type=${importType}.\n\n--- TSV START ---\n${tsv}\n--- TSV END ---`,
            },
          ],
        },
      ],
    });

    const block = message.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    if (!block) {
      throw new Error("AI не повернув структуру");
    }
    const input = block.input as { rows?: unknown[]; notes?: unknown[] };
    extracted = {
      rows: Array.isArray(input.rows) ? (input.rows as ParsedRow[]) : [],
      notes: Array.isArray(input.notes)
        ? (input.notes as string[]).filter((n) => typeof n === "string")
        : [],
    };
  } catch (err) {
    console.error("[financing/import/parse] AI error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `AI помилка: ${err.message}`
            : "Помилка AI розпізнавання",
      },
      { status: 502 },
    );
  }

  // Sanitize rows: amount > 0, title non-empty, category in allowed set
  const allowed: Set<string> = new Set(allowedKeys);
  const cleaned = extracted.rows
    .filter((r) => {
      if (!r) return false;
      if (typeof r.title !== "string" || !r.title.trim()) return false;
      if (typeof r.amount !== "number" || !Number.isFinite(r.amount) || r.amount <= 0)
        return false;
      if (!allowed.has(r.category)) return false;
      return true;
    })
    .map<ParsedRow>((r) => ({
      sourceRow: typeof r.sourceRow === "number" ? r.sourceRow : 0,
      occurredAt:
        typeof r.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.occurredAt)
          ? r.occurredAt
          : null,
      title: r.title.trim().slice(0, 200),
      amount: Math.round(r.amount * 100) / 100,
      category: r.category,
      counterparty:
        typeof r.counterparty === "string" && r.counterparty.trim()
          ? r.counterparty.trim().slice(0, 200)
          : null,
      description:
        typeof r.description === "string" && r.description.trim()
          ? r.description.trim().slice(0, 1000)
          : null,
    }));

  return NextResponse.json({
    rows: cleaned,
    notes: extracted.notes,
    truncated,
    totalRowsInFile: matrix.length - 1,
    sheetName,
    fileName: file.name,
  });
}
