/**
 * Excel Project Plan Parser
 *
 * Парсить Excel у форматі «ПРОЄКТ New.xlsx» — повний план проєкту з
 * розкладкою на кошторис + Gantt в одному файлі. Очікувані листи:
 *
 *  - PROJECTS  — шапка проєкту (1 рядок даних)
 *  - STAGES    — рядки кошторису з полями планування (predecessor + lag)
 *  - ЗВЕДЕНА   — pivot (ігноруємо при імпорті)
 *
 * Це окремий формат від `excel-estimate-parser.ts` (вузький estimate
 * без планування). Призначено для нової фічі Estimate → Task auto-sync.
 */

import * as XLSX from "xlsx";

export type ExcelDependencyType = "FS" | "SS" | "FF" | "SF";

export interface ParsedProjectMeta {
  /** Перший непорожній рядок у PROJECTS — назва проєкту. */
  title: string;
  /** Хто веде проєкт (опціонально). */
  responsible?: string;
  /** Замовник (опціонально). */
  client?: string;
  plannedStart?: Date;
  plannedEnd?: Date;
}

export interface ParsedPlanItem {
  /** Глобальний номер рядка у листі STAGES (для діагностики помилок). */
  rowNumber: number;
  /** Колонка «№ п/п», збережено як рядок ("1.2", "2.13" тощо). */
  seq: string;
  /** Колонка «Етап» — стане title секції в Estimate. */
  etap: string;
  /** Колонка «Найменування». */
  description: string;
  /** "Робота" | "Матеріал" → нормалізовано до itemType. */
  itemType: "labor" | "material" | null;
  /** Колонка «Одиниця виміру». */
  unit: string;
  /** Колонка «Кількість». */
  quantity: number;
  /** Собівартість за одиницю. null якщо порожньо у комірці. */
  unitCost: number | null;
  /** Вартість за одиницю (для замовника). null якщо порожньо. */
  unitPriceCustomer: number | null;
  /** План початок. */
  plannedStart: Date | null;
  /** План тривалість (днів). null якщо порожньо. */
  plannedDurationDays: number | null;
  /** Колонка «Попередник» (string ref на seq іншого рядка). */
  predecessorSeq: string | null;
  /** Тип звʼязку. */
  dependencyType: ExcelDependencyType | null;
  /** Зміщ. (днів, може бути відʼємним). */
  dependencyLagDays: number;
}

export interface ParseProjectPlanResult {
  success: boolean;
  project: ParsedProjectMeta | null;
  items: ParsedPlanItem[];
  errors: string[];
  warnings: string[];
}

const STAGES_SHEET_CANDIDATES = ["STAGES", "Stages", "stages"];
const PROJECTS_SHEET_CANDIDATES = ["PROJECTS", "Projects", "projects"];

const ITEM_TYPE_MAP: Record<string, "labor" | "material"> = {
  робота: "labor",
  матеріал: "material",
  "матеріали": "material",
  labor: "labor",
  material: "material",
  work: "labor",
};

const DEP_TYPE_VALID = new Set<ExcelDependencyType>(["FS", "SS", "FF", "SF"]);

function findSheet(
  workbook: XLSX.WorkBook,
  candidates: string[],
): XLSX.WorkSheet | null {
  for (const name of candidates) {
    if (workbook.Sheets[name]) return workbook.Sheets[name];
  }
  // Fallback: case-insensitive lookup
  const lower = candidates.map((c) => c.toLowerCase());
  for (const sheetName of workbook.SheetNames) {
    if (lower.includes(sheetName.toLowerCase())) {
      return workbook.Sheets[sheetName] ?? null;
    }
  }
  return null;
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function asNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function asIntOrNull(v: unknown): number | null {
  const n = asNumberOrNull(v);
  if (n == null) return null;
  return Math.round(n);
}

function asDateOrNull(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "number") {
    // Excel serial → JS Date. SSF.parse_date_code is the canonical helper.
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, (d.m ?? 1) - 1, d.d ?? 1));
  }
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseItemType(v: unknown): "labor" | "material" | null {
  const s = asString(v).toLowerCase();
  if (!s) return null;
  return ITEM_TYPE_MAP[s] ?? null;
}

function parseDependencyType(v: unknown): ExcelDependencyType | null {
  const s = asString(v).toUpperCase();
  if (!s) return null;
  return DEP_TYPE_VALID.has(s as ExcelDependencyType) ? (s as ExcelDependencyType) : null;
}

/**
 * Колонки в STAGES очікуються у строго фіксованому порядку (як у
 * `ПРОЄКТ New.xlsx`). Якщо порядок зміниться — змінити цей мапінг.
 *
 *  A — ID Проєкту
 *  B — Назва проєкту
 *  C — № п/п
 *  D — Найменування
 *  E — Етап
 *  F — Тип
 *  G — Одиниця виміру
 *  H — Кількість
 *  I — Собівартість за одиницю
 *  J — Собівартість разом      (computed — ignore)
 *  K — Вартість за одиницю
 *  L — Вартість разом          (computed — ignore)
 *  M — План початок
 *  N — План тривал.
 *  O — План кінець             (ignore — обчислюємо з start+duration)
 *  P — Попередник
 *  Q — Тип звʼязку
 *  R — Зміщ.
 */
const COL = {
  seq: 2,
  description: 3,
  etap: 4,
  type: 5,
  unit: 6,
  quantity: 7,
  unitCost: 8,
  unitPriceCustomer: 10,
  plannedStart: 12,
  plannedDurationDays: 13,
  predecessorSeq: 15,
  dependencyType: 16,
  dependencyLagDays: 17,
} as const;

function parseStagesSheet(
  worksheet: XLSX.WorkSheet,
  warnings: string[],
): ParsedPlanItem[] {
  // raw: false → primitive cell values; повертає Date для дат, number для чисел.
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  }) as any[][];

  const items: ParsedPlanItem[] = [];
  // Перший рядок — заголовки.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const seq = asString(row[COL.seq]);
    const description = asString(row[COL.description]);
    if (!seq || !description) continue;

    const etap = asString(row[COL.etap]);
    if (!etap) {
      warnings.push(`Row ${i + 1}: empty Етап — buying section "Без секції"`);
    }
    const itemType = parseItemType(row[COL.type]);
    const unit = asString(row[COL.unit]) || "шт";
    const quantity = asNumberOrNull(row[COL.quantity]) ?? 0;
    const unitCost = asNumberOrNull(row[COL.unitCost]);
    const unitPriceCustomer = asNumberOrNull(row[COL.unitPriceCustomer]);
    const plannedStart = asDateOrNull(row[COL.plannedStart]);
    const plannedDurationDays = asIntOrNull(row[COL.plannedDurationDays]);
    const rawPred = asString(row[COL.predecessorSeq]);
    const predecessorSeq = rawPred ? rawPred : null;
    const dependencyType = parseDependencyType(row[COL.dependencyType]);
    const dependencyLagDays = asIntOrNull(row[COL.dependencyLagDays]) ?? 0;

    items.push({
      rowNumber: i + 1,
      seq,
      etap: etap || "Без секції",
      description,
      itemType,
      unit,
      quantity,
      unitCost,
      unitPriceCustomer,
      plannedStart,
      plannedDurationDays,
      predecessorSeq,
      dependencyType,
      dependencyLagDays,
    });
  }

  return items;
}

function parseProjectsSheet(worksheet: XLSX.WorkSheet): ParsedProjectMeta | null {
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  }) as any[][];
  if (rows.length < 2) return null;
  const data = rows[1];
  if (!data) return null;
  // Колонки PROJECTS: ID, Назва, Відповідальний, Замовник, Статус,
  //                   План початок, План закінчення, [computed]...
  const title = asString(data[1]);
  if (!title) return null;
  return {
    title,
    responsible: asString(data[2]) || undefined,
    client: asString(data[3]) || undefined,
    plannedStart: asDateOrNull(data[5]) ?? undefined,
    plannedEnd: asDateOrNull(data[6]) ?? undefined,
  };
}

export async function parseExcelProjectPlan(
  fileBuffer: ArrayBuffer | Buffer,
): Promise<ParseProjectPlanResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    const workbook = XLSX.read(fileBuffer, {
      type: fileBuffer instanceof ArrayBuffer ? "array" : "buffer",
      cellDates: true,
    });

    const projectsSheet = findSheet(workbook, PROJECTS_SHEET_CANDIDATES);
    const stagesSheet = findSheet(workbook, STAGES_SHEET_CANDIDATES);

    if (!stagesSheet) {
      errors.push(
        "Не знайдено лист STAGES — у файлі очікується назва саме STAGES або Stages.",
      );
      return { success: false, project: null, items: [], errors, warnings };
    }

    const project = projectsSheet ? parseProjectsSheet(projectsSheet) : null;
    const items = parseStagesSheet(stagesSheet, warnings);

    if (items.length === 0) {
      errors.push("Лист STAGES не містить жодного валідного рядка.");
      return { success: false, project, items: [], errors, warnings };
    }

    // Валідація унікальності seq + перевірка predecessor → існує.
    const seqSet = new Set<string>();
    for (const it of items) {
      if (seqSet.has(it.seq)) {
        warnings.push(`Дубль № п/п "${it.seq}" (рядок ${it.rowNumber}).`);
      }
      seqSet.add(it.seq);
    }
    for (const it of items) {
      if (it.predecessorSeq && !seqSet.has(it.predecessorSeq)) {
        warnings.push(
          `Рядок ${it.rowNumber} (${it.seq}): попередник "${it.predecessorSeq}" не знайдено серед позицій.`,
        );
      }
    }

    return { success: true, project, items, errors, warnings };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Невідома помилка парсингу");
    return { success: false, project: null, items: [], errors, warnings };
  }
}
