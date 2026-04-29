import { FINANCE_CATEGORIES } from "@/lib/constants";

export type DeterministicRow = {
  occurredAt: string | null;
  title: string;
  amount: number;
  category: string;
  counterparty: string | null;
  description: string | null;
  direction?: "INCOME" | "EXPENSE";
  sourceRow: number;
};

export type DeterministicResult = {
  rows: DeterministicRow[];
  matchedHeaders: Record<string, string>;
  notes: string[];
};

type ImportType = "INCOME" | "EXPENSE" | "AUTO";

/**
 * Канонічні поля → синоніми у заголовках. Усе порівнюється у lowercase
 * без зайвих пробілів і без знаків пунктуації.
 */
const HEADER_SYNONYMS: Record<string, string[]> = {
  date: [
    "дата",
    "date",
    "період",
    "дата операції",
    "дата платежу",
    "дата зарахування",
    "дата списання",
    "коли",
    "transaction date",
    "operation date",
  ],
  title: [
    "назва",
    "опис",
    "призначення",
    "призначення платежу",
    "найменування",
    "коментар",
    "примітка",
    "title",
    "description",
    "details",
    "comment",
    "memo",
    "narration",
  ],
  amount: [
    "сума",
    "amount",
    "total",
    "сума, грн",
    "сума ₴",
    "сума uah",
    "грн",
    "uah",
    "сума операції",
    "value",
  ],
  amountIncome: [
    "дохід",
    "доходи",
    "кредит",
    "зараховано",
    "income",
    "credit",
    "deposit",
    "in",
    "приход",
  ],
  amountExpense: [
    "витрата",
    "витрати",
    "дебет",
    "списано",
    "expense",
    "debit",
    "withdrawal",
    "out",
    "розхід",
  ],
  category: [
    "категорія",
    "category",
    "стаття",
    "стаття витрат",
    "тип витрати",
    "тип операції",
    "type",
    "kind",
  ],
  counterparty: [
    "контрагент",
    "постачальник",
    "одержувач",
    "платник",
    "відправник",
    "counterparty",
    "vendor",
    "payer",
    "payee",
    "from",
    "to",
    "name",
    "контрагенти",
    "клієнт",
  ],
};

const CATEGORY_LABEL_TO_KEY: Map<string, string> = new Map(
  FINANCE_CATEGORIES.map((c) => [c.label.toLowerCase().trim(), c.key]),
);

const CATEGORY_KEY_SET: Set<string> = new Set(
  FINANCE_CATEGORIES.map((c) => c.key),
);

function normalize(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .toLowerCase()
    .replace(/[*"'`~,.;:()\[\]{}\\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectHeader(matrix: unknown[][]): {
  headerRowIdx: number;
  mapping: Record<string, number>;
  amountColumn:
    | { kind: "single"; col: number }
    | { kind: "split"; income: number; expense: number };
} | null {
  // Шукаємо заголовок серед перших 5 рядків — деякі експорти мають title-рядки зверху.
  const limit = Math.min(matrix.length, 5);
  for (let r = 0; r < limit; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;
    const cells = row.map(normalize);

    const mapping: Record<string, number> = {};
    let incomeCol = -1;
    let expenseCol = -1;
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      if (!cell) continue;
      for (const [field, syns] of Object.entries(HEADER_SYNONYMS)) {
        if (mapping[field] !== undefined) continue;
        if (syns.some((s) => cell === s || cell.includes(s))) {
          if (field === "amountIncome") {
            incomeCol = c;
          } else if (field === "amountExpense") {
            expenseCol = c;
          } else {
            mapping[field] = c;
          }
          break;
        }
      }
    }

    // Мінімально потрібно: amount (single або split) + щось схоже на назву
    const hasTitle = mapping.title !== undefined;
    const hasAmount = mapping.amount !== undefined;
    const hasSplit = incomeCol >= 0 && expenseCol >= 0;

    if ((hasAmount || hasSplit) && hasTitle) {
      const amountColumn = hasSplit
        ? { kind: "split" as const, income: incomeCol, expense: expenseCol }
        : { kind: "single" as const, col: mapping.amount };
      return { headerRowIdx: r, mapping, amountColumn };
    }
  }
  return null;
}

function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  let s = String(raw).trim();
  if (!s) return null;
  // Видалити валюту, пробіли nbsp, апостроф-розділювач
  s = s
    .replace(/[₴$€£]/g, "")
    .replace(/(грн|uah|usd|eur|usd\.|грн\.)/gi, "")
    .replace(/[   ]/g, " ")
    .replace(/'/g, "")
    .trim();
  // "1 234,56" → "1234.56"; "1,234.56" → "1234.56"; "(123)" → "-123"
  const neg = /^\(.+\)$/.test(s) || /^-/.test(s) || /\bmin(us)?\b/i.test(s);
  s = s.replace(/^[+-]/, "").replace(/^\(/, "").replace(/\)$/, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(/\s/g, "").replace(",", ".");
  } else {
    s = s.replace(/\s/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Серіальне число Excel — XLSX.utils з cellDates: true має повертати Date,
  // але деякі експорти лишають числа.
  const numeric = Number(s);
  if (Number.isFinite(numeric) && numeric > 30000 && numeric < 80000) {
    // Excel epoch: 1899-12-30
    const ms = (numeric - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const iso = toIso(+m[1], +m[2], +m[3]);
    if (iso) return iso;
  }
  // dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const iso = toIso(year, +m[2], +m[1]);
    if (iso) return iso;
  }
  // Last resort — Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

function pickCategory(
  raw: unknown,
  type: "INCOME" | "EXPENSE",
): string {
  const norm = normalize(raw);
  if (norm) {
    const direct = CATEGORY_LABEL_TO_KEY.get(norm);
    if (direct) return direct;
    if (CATEGORY_KEY_SET.has(norm)) return norm;
    // Часткові збіги
    for (const [label, key] of CATEGORY_LABEL_TO_KEY.entries()) {
      if (label.length >= 4 && norm.includes(label)) return key;
    }
  }
  return type === "INCOME" ? "other_income" : "other_expense";
}

/**
 * Намагається розпарсити sheet детерміновано. Повертає null, якщо заголовок
 * не вдалося розпізнати або не вистачає обовʼязкових колонок.
 */
export function tryDeterministicParse(
  matrix: unknown[][],
  importType: ImportType,
): DeterministicResult | null {
  const detect = detectHeader(matrix);
  if (!detect) return null;

  const { headerRowIdx, mapping, amountColumn } = detect;
  const dataRows = matrix.slice(headerRowIdx + 1);
  const result: DeterministicRow[] = [];
  const notes: string[] = [];
  let dropped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length === 0) continue;
    const isAllEmpty = row.every(
      (c) => c === null || c === undefined || String(c).trim() === "",
    );
    if (isAllEmpty) continue;

    let amount: number | null = null;
    if (amountColumn.kind === "single") {
      amount = parseAmount(row[amountColumn.col]);
    } else {
      const inc = parseAmount(row[amountColumn.income]) ?? 0;
      const exp = parseAmount(row[amountColumn.expense]) ?? 0;
      if (inc !== 0) amount = Math.abs(inc);
      else if (exp !== 0) amount = -Math.abs(exp);
      else amount = null;
    }
    if (amount === null || amount === 0) {
      dropped++;
      continue;
    }

    const titleRaw = mapping.title !== undefined ? row[mapping.title] : "";
    const title = String(titleRaw ?? "").trim();
    if (!title) {
      dropped++;
      continue;
    }

    const direction: "INCOME" | "EXPENSE" =
      amountColumn.kind === "split"
        ? amount > 0
          ? "INCOME"
          : "EXPENSE"
        : importType === "AUTO"
          ? amount >= 0
            ? "INCOME"
            : "EXPENSE"
          : (importType as "INCOME" | "EXPENSE");

    if (importType !== "AUTO" && direction !== importType) {
      // У режимі INCOME-only / EXPENSE-only пропускаємо протилежні рядки
      dropped++;
      continue;
    }

    const occurredAt =
      mapping.date !== undefined ? parseDate(row[mapping.date]) : null;

    const category = pickCategory(
      mapping.category !== undefined ? row[mapping.category] : null,
      direction,
    );

    const counterparty =
      mapping.counterparty !== undefined
        ? String(row[mapping.counterparty] ?? "").trim() || null
        : null;

    result.push({
      sourceRow: i + 1,
      occurredAt,
      title: title.slice(0, 200),
      amount: Math.round(Math.abs(amount) * 100) / 100,
      category,
      counterparty: counterparty ? counterparty.slice(0, 200) : null,
      description: null,
      direction: importType === "AUTO" ? direction : undefined,
    });
  }

  if (result.length === 0) return null;
  if (dropped > result.length * 2) {
    // Якщо детермінований парсер відкинув значно більше ніж зберіг — навряд
    // структура зрозуміла, краще передати на AI.
    return null;
  }
  if (dropped > 0) {
    notes.push(`Детермінований парсер пропустив ${dropped} рядків без суми/назви.`);
  }

  const matchedHeaders: Record<string, string> = {};
  for (const [field, col] of Object.entries(mapping)) {
    matchedHeaders[field] = String(matrix[headerRowIdx][col] ?? "");
  }
  if (amountColumn.kind === "split") {
    matchedHeaders.amountIncome = String(
      matrix[headerRowIdx][amountColumn.income] ?? "",
    );
    matchedHeaders.amountExpense = String(
      matrix[headerRowIdx][amountColumn.expense] ?? "",
    );
  }

  return { rows: result, matchedHeaders, notes };
}
