/**
 * Розбирає текст, скопійований з Excel / Google Sheets (TSV — табуляція як
 * роздільник) у дерево «розділ → підетапи».
 *
 * Підтримувані формати рядка (порядок колонок гнучкий, але стабільний у межах
 * одного paste):
 *
 *   1) Тільки назва ⇒ заголовок розділу (top-level), наприклад:
 *        Промислова підлога
 *
 *   2) Назва + одиниця + обсяг + вартість + (опц.) ціна для замовника:
 *        Монтаж лотка водовідведення\tм.п.\t92\t400
 *        Улаштування бетону\tм2\t3000\t200\t300
 *
 *   3) Назва + відповідальний + статус + (gap) + обсяг + од + ціна (як у
 *      RD_01_ПРОЄКТ): автодетект — якщо колонок >= 6, шукаємо першу числову
 *      "обсяг", далі од., далі ціна.
 *
 * Перший рядок, якщо містить лейбли «Назва», «Об'єм», «Вартість» тощо —
 * пропускається (header).
 *
 * NB: парсер свідомо толерантний — не падає на дивні дані, просто зкипає
 * рядок зі звітом у `errors`.
 */

export type ParsedNode = {
  /** Тимчасовий ID для прив'язки children → parent у клієнті. */
  tempId: string;
  parentTempId: string | null;
  customName: string;
  /** true = це розділ-заголовок (без обсягу/ціни). */
  isSection: boolean;
  unit: string | null;
  planVolume: number | null;
  planUnitPrice: number | null;
  planClientUnitPrice: number | null;
  /** Опційно — Відповідальний як рядок (буде ігноруватися сервером, бо ми не маємо id). */
  responsibleHint: string | null;
  /** Початковий номер рядка (1-based) — для звіту помилок. */
  sourceLine: number;
};

export type ParseResult = {
  nodes: ParsedNode[];
  errors: { line: number; raw: string; reason: string }[];
};

const HEADER_KEYWORDS = [
  "назва",
  "об'єм",
  "обєм",
  "обсяг",
  "од.",
  "одиниц",
  "вартість",
  "ціна",
  "замовник",
  "відповідальний",
  "статус",
];

function isLikelyHeader(cells: string[]): boolean {
  const lc = cells.map((c) => c.trim().toLowerCase()).join(" ");
  let hits = 0;
  for (const kw of HEADER_KEYWORDS) {
    if (lc.includes(kw)) hits++;
  }
  return hits >= 2;
}

function parseUaNumber(s: string): number | null {
  if (!s) return null;
  // "10 000 ₴", "1 000,50", "1.000,50", "1,000.50", "₴10000", тощо
  const cleaned = s
    .replace(/[   ]/g, " ") // nbsp variants
    .replace(/[₴UAH$€£\s]/giu, "")
    .replace(/[^\d.,-]/g, "")
    .trim();
  if (!cleaned) return null;
  // Якщо є і "," і "." — вибираємо останній як decimal-separator.
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    // Тільки кома: трактуємо як decimal якщо після коми ≤ 3 цифр, інакше — тисячі.
    const after = cleaned.length - lastComma - 1;
    normalized = after <= 3 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const UNIT_HINT = new Set([
  "шт",
  "шт.",
  "м",
  "м.",
  "м2",
  "м²",
  "м3",
  "м³",
  "кг",
  "т",
  "л",
  "пог.м",
  "м.п.",
  "м.п",
  "пог",
  "год",
]);

function looksLikeUnit(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (!t) return false;
  if (UNIT_HINT.has(t)) return true;
  return /^[а-яa-z]{1,5}\.?\d?$/i.test(t) && t.length <= 6;
}

function genTempId(): string {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`;
}

export function parseSpreadsheetTsv(text: string): ParseResult {
  const errors: ParseResult["errors"] = [];
  const nodes: ParsedNode[] = [];
  // Останній відкритий розділ — куди підгортаємо item-рядки за замовчуванням.
  let currentSectionTempId: string | null = null;

  const lines = text.split(/\r?\n/);
  let lineNo = 0;
  let headerSkipped = false;

  for (const rawLine of lines) {
    lineNo++;
    const line = rawLine.replace(/ /g, " ");
    if (!line.trim()) continue;

    // Розбиваємо по табуляції (Excel/Sheets copy формат). Якщо нема табів —
    // спробуємо ; та |.
    let cells = line.split("\t");
    if (cells.length === 1) cells = line.split(/\s{2,}|\s*\|\s*|;/);
    cells = cells.map((c) => c.trim());

    // Header detection — тільки на першому непорожньому рядку.
    if (!headerSkipped && isLikelyHeader(cells)) {
      headerSkipped = true;
      continue;
    }
    headerSkipped = true;

    const nonEmpty = cells.filter(Boolean);

    // 1) Один значимий cell або всі окрім першого пусті → section.
    const meaningfulCount = nonEmpty.length;
    const firstCell = cells[0]?.trim() ?? "";
    if (!firstCell) {
      errors.push({ line: lineNo, raw: rawLine, reason: "Порожня перша колонка" });
      continue;
    }
    if (meaningfulCount === 1) {
      const tempId = genTempId();
      nodes.push({
        tempId,
        parentTempId: null,
        customName: firstCell.slice(0, 200),
        isSection: true,
        unit: null,
        planVolume: null,
        planUnitPrice: null,
        planClientUnitPrice: null,
        responsibleHint: null,
        sourceLine: lineNo,
      });
      currentSectionTempId = tempId;
      continue;
    }

    // 2) Item — намагаємося ідентифікувати числові поля volume/unitPrice/clientPrice,
    //    та одиницю виміру. Підхід: знаходимо всі числові cells і unit.
    type Cls = "name" | "responsible" | "status" | "unit" | "num" | "skip";
    const labels: Cls[] = cells.map((c, idx) => {
      if (idx === 0) return "name";
      if (!c) return "skip";
      if (looksLikeUnit(c)) return "unit";
      const n = parseUaNumber(c);
      if (n !== null) return "num";
      // Не число, не одиниця: припускаємо це responsible або статус
      // (статус — короткий контейнер: "Новий", "В процесі", "Завершено").
      const lc = c.toLowerCase();
      if (
        lc === "новий" ||
        lc.includes("процес") ||
        lc.includes("заверш") ||
        lc.includes("очік")
      )
        return "status";
      return "responsible";
    });

    const nums: number[] = [];
    let unit: string | null = null;
    let responsible: string | null = null;
    cells.forEach((c, idx) => {
      const cls = labels[idx];
      if (cls === "num") {
        const n = parseUaNumber(c);
        if (n !== null) nums.push(n);
      } else if (cls === "unit" && !unit) {
        unit = c;
      } else if (cls === "responsible" && !responsible && idx <= 5) {
        responsible = c;
      }
    });

    // Спрощено мапимо:
    //   1 число   = volume (вартість невідома → пропускаємо)
    //   2 числа   = volume, unitPrice
    //   3 числа   = volume, unitPrice, clientPrice
    //   ≥4 чисел  = volume, unitPrice, clientPrice (інші ігноруємо)
    let planVolume: number | null = null;
    let planUnitPrice: number | null = null;
    let planClientUnitPrice: number | null = null;
    if (nums.length >= 1) planVolume = nums[0];
    if (nums.length >= 2) planUnitPrice = nums[1];
    if (nums.length >= 3) planClientUnitPrice = nums[2];

    // Якщо у нас тільки 1 число І це likely Item-y row (є unit) — приймаємо.
    // Якщо немає чисел і нема unit → це теж section header (fallback).
    if (nums.length === 0 && !unit) {
      const tempId = genTempId();
      nodes.push({
        tempId,
        parentTempId: null,
        customName: firstCell.slice(0, 200),
        isSection: true,
        unit: null,
        planVolume: null,
        planUnitPrice: null,
        planClientUnitPrice: null,
        responsibleHint: null,
        sourceLine: lineNo,
      });
      currentSectionTempId = tempId;
      continue;
    }

    nodes.push({
      tempId: genTempId(),
      parentTempId: currentSectionTempId,
      customName: firstCell.slice(0, 200),
      isSection: false,
      unit,
      planVolume,
      planUnitPrice,
      planClientUnitPrice,
      responsibleHint: responsible,
      sourceLine: lineNo,
    });
  }

  return { nodes, errors };
}
