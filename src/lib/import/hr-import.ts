import ExcelJS from "exceljs";

export type ImportError = { row: number; field: string; message: string };

export type ImportResult<T> = {
  data: T[];
  errors: ImportError[];
  totalRows: number;
  validRows: number;
};

type HeaderMatcher = (normalized: string) => boolean;

function normalize(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function includesAny(normalized: string, needles: string[]): boolean {
  return needles.some((n) => normalized.includes(n));
}

function readRow(worksheet: ExcelJS.Worksheet): { headers: string[]; totalRows: number } {
  const header = worksheet.getRow(1);
  const headers: string[] = [];
  header.eachCell((cell, colNumber) => {
    headers[colNumber] = normalize(cell.value);
  });
  return { headers, totalRows: worksheet.rowCount };
}

function matchColumn(
  headers: string[],
  matcher: HeaderMatcher,
): number | undefined {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] && matcher(headers[i])) return i;
  }
  return undefined;
}

function cellValue(ws: ExcelJS.Worksheet, row: number, col: number | undefined): string {
  if (col === undefined) return "";
  const cell = ws.getRow(row).getCell(col);
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null) {
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return String(v.result ?? "").trim();
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

function parseNumber(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  // Try ISO first, then DD.MM.YYYY
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) return dt;
  }
  return null;
}

function emailValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ======== Raw cell reader (for AI fallback) ========

export async function readSheetAsRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("Excel файл порожній");

  const out: string[][] = [];
  const total = ws.rowCount;
  const maxCol = ws.columnCount;
  for (let r = 1; r <= total; r++) {
    const row: string[] = [];
    for (let c = 1; c <= maxCol; c++) {
      row.push(cellValue(ws, r, c));
    }
    out.push(row);
  }
  return out;
}

// ======== Employees ========

export type EmployeeImportRow = {
  fullName: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  birthDate: Date | null;
  residence: string | null;
  maritalStatus: string | null;
  hiredAt: Date | null;
  terminatedAt: Date | null;
  salaryType: "MONTHLY" | "HOURLY";
  salaryAmount: number | null;
  currency: string;
  extraData: string | null;
  notes: string | null;
  isActive: boolean;
};

export async function parseEmployeesExcel(
  buffer: Buffer,
): Promise<ImportResult<EmployeeImportRow>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("Excel файл порожній");

  const { headers, totalRows } = readRow(ws);
  const cols = {
    fullName: matchColumn(headers, (h) =>
      includesAny(h, ["піб", "фио", "прізвище", "ім'я", "імʼя", "full name", "name"]),
    ),
    phone: matchColumn(headers, (h) => includesAny(h, ["телефон", "phone", "мобільн", "номер"])),
    email: matchColumn(headers, (h) => includesAny(h, ["email", "пошта", "e-mail"])),
    position: matchColumn(headers, (h) => includesAny(h, ["посада", "position"])),
    birthDate: matchColumn(headers, (h) =>
      includesAny(h, ["народж", "birth", "д.н.", "дн", "birthday"]),
    ),
    residence: matchColumn(headers, (h) =>
      includesAny(h, ["проживан", "адрес", "address", "місто", "residence"]),
    ),
    maritalStatus: matchColumn(headers, (h) =>
      includesAny(h, ["сімейний", "сім'я", "marital", "статус сім"]),
    ),
    hiredAt: matchColumn(headers, (h) =>
      includesAny(h, ["прийнятт", "початок робот", "hired", "дата прийом", "приймання"]),
    ),
    terminatedAt: matchColumn(headers, (h) =>
      includesAny(h, ["звільнен", "кінець роб", "terminated", "звільнив"]),
    ),
    salaryType: matchColumn(headers, (h) =>
      includesAny(h, ["тип зп", "тип зарплат", "salary type"]),
    ),
    salaryAmount: matchColumn(headers, (h) =>
      includesAny(h, ["зарплата", "зп", "salary", "ставка", "оплата"]),
    ),
    currency: matchColumn(headers, (h) => includesAny(h, ["валюта", "currency"])),
    extraData: matchColumn(headers, (h) => includesAny(h, ["додатков", "extra"])),
    notes: matchColumn(headers, (h) => includesAny(h, ["коментар", "notes", "примітк"])),
  };

  if (cols.fullName === undefined) {
    throw new Error("Відсутня обовʼязкова колонка: ПІБ");
  }

  const data: EmployeeImportRow[] = [];
  const errors: ImportError[] = [];

  for (let r = 2; r <= totalRows; r++) {
    const fullName = cellValue(ws, r, cols.fullName);
    if (!fullName) continue;

    const emailRaw = cellValue(ws, r, cols.email);
    if (emailRaw && !emailValid(emailRaw)) {
      errors.push({ row: r, field: "email", message: "Невірний email" });
      continue;
    }

    const salaryTypeRaw = normalize(cellValue(ws, r, cols.salaryType));
    const salaryType: "MONTHLY" | "HOURLY" =
      salaryTypeRaw.includes("год") || salaryTypeRaw.includes("hour") ? "HOURLY" : "MONTHLY";

    data.push({
      fullName,
      phone: cellValue(ws, r, cols.phone) || null,
      email: emailRaw || null,
      position: cellValue(ws, r, cols.position) || null,
      birthDate: parseDate(cellValue(ws, r, cols.birthDate)),
      residence: cellValue(ws, r, cols.residence) || null,
      maritalStatus: cellValue(ws, r, cols.maritalStatus) || null,
      hiredAt: parseDate(cellValue(ws, r, cols.hiredAt)),
      terminatedAt: parseDate(cellValue(ws, r, cols.terminatedAt)),
      salaryType,
      salaryAmount: parseNumber(cellValue(ws, r, cols.salaryAmount)),
      currency: cellValue(ws, r, cols.currency) || "UAH",
      extraData: cellValue(ws, r, cols.extraData) || null,
      notes: cellValue(ws, r, cols.notes) || null,
      isActive: true,
    });
  }

  return { data, errors, totalRows: totalRows - 1, validRows: data.length };
}

export async function generateEmployeesTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Співробітники");
  ws.columns = [
    { header: "ПІБ *", key: "fullName", width: 32 },
    { header: "Посада", key: "position", width: 22 },
    { header: "Телефон", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 28 },
    { header: "Дата народження", key: "birthDate", width: 18 },
    { header: "Місце проживання", key: "residence", width: 30 },
    { header: "Сімейний стан", key: "maritalStatus", width: 18 },
    { header: "Початок роботи", key: "hiredAt", width: 18 },
    { header: "Дата звільнення", key: "terminatedAt", width: 18 },
    { header: "Тип ЗП (місячна/погодинна)", key: "salaryType", width: 26 },
    { header: "Сума ЗП", key: "salaryAmount", width: 14 },
    { header: "Валюта", key: "currency", width: 10 },
    { header: "Додаткові дані", key: "extraData", width: 24 },
    { header: "Коментар", key: "notes", width: 30 },
  ];
  styleHeader(ws);
  ws.addRow({
    fullName: "Петренко Іван Сергійович",
    position: "Бригадир",
    phone: "+380501234567",
    email: "ivan@example.com",
    birthDate: "15.03.1985",
    residence: "м. Львів, вул. Зелена, 12",
    maritalStatus: "одружений",
    hiredAt: "01.06.2022",
    terminatedAt: "",
    salaryType: "місячна",
    salaryAmount: 30000,
    currency: "UAH",
    extraData: "",
    notes: "",
  });
  ws.addRow({
    fullName: "Коваленко Марія",
    position: "Інженер",
    phone: "",
    email: "",
    birthDate: "07.11.1998",
    residence: "м. Львів",
    maritalStatus: "неодружена",
    hiredAt: "10.01.2024",
    terminatedAt: "",
    salaryType: "погодинна",
    salaryAmount: 250,
    currency: "UAH",
    extraData: "",
    notes: "Стажерка",
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ======== Counterparties ========

export type CounterpartyImportRow = {
  name: string;
  type: "LEGAL" | "INDIVIDUAL" | "FOP";
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

export async function parseCounterpartiesExcel(
  buffer: Buffer,
): Promise<ImportResult<CounterpartyImportRow>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("Excel файл порожній");

  const { headers, totalRows } = readRow(ws);
  const cols = {
    name: matchColumn(headers, (h) =>
      includesAny(h, ["назва", "name", "компан"]),
    ),
    type: matchColumn(headers, (h) => includesAny(h, ["тип", "type"])),
    taxId: matchColumn(headers, (h) =>
      includesAny(h, ["єдрпоу", "ідрпоу", "ипн", "іпн", "ipn", "edrpou", "код", "tax"]),
    ),
    phone: matchColumn(headers, (h) => includesAny(h, ["телефон", "phone"])),
    email: matchColumn(headers, (h) => includesAny(h, ["email", "пошта", "e-mail"])),
    address: matchColumn(headers, (h) => includesAny(h, ["адрес", "address"])),
    notes: matchColumn(headers, (h) => includesAny(h, ["коментар", "notes", "примітк"])),
  };

  if (cols.name === undefined) {
    throw new Error("Відсутня обовʼязкова колонка: Назва");
  }

  const data: CounterpartyImportRow[] = [];
  const errors: ImportError[] = [];

  for (let r = 2; r <= totalRows; r++) {
    const name = cellValue(ws, r, cols.name);
    if (!name) continue;

    const typeRaw = normalize(cellValue(ws, r, cols.type));
    let type: "LEGAL" | "INDIVIDUAL" | "FOP" = "LEGAL";
    if (typeRaw.includes("фоп") || typeRaw === "fop") type = "FOP";
    else if (typeRaw.includes("фіз") || typeRaw.includes("individual")) type = "INDIVIDUAL";

    const emailRaw = cellValue(ws, r, cols.email);
    if (emailRaw && !emailValid(emailRaw)) {
      errors.push({ row: r, field: "email", message: "Невірний email" });
      continue;
    }

    data.push({
      name,
      type,
      taxId: cellValue(ws, r, cols.taxId) || null,
      phone: cellValue(ws, r, cols.phone) || null,
      email: emailRaw || null,
      address: cellValue(ws, r, cols.address) || null,
      notes: cellValue(ws, r, cols.notes) || null,
      isActive: true,
    });
  }

  return { data, errors, totalRows: totalRows - 1, validRows: data.length };
}

export async function generateCounterpartiesTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Контрагенти");
  ws.columns = [
    { header: "Назва *", key: "name", width: 32 },
    { header: "Тип (юр/фіз/ФОП)", key: "type", width: 18 },
    { header: "ЄДРПОУ / ІПН", key: "taxId", width: 16 },
    { header: "Телефон", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 26 },
    { header: "Адреса", key: "address", width: 32 },
    { header: "Коментар", key: "notes", width: 30 },
  ];
  styleHeader(ws);
  ws.addRow({
    name: "ТОВ \"Будматеріали\"",
    type: "юр",
    taxId: "12345678",
    phone: "+380321112233",
    email: "info@budmat.ua",
    address: "м. Львів, вул. Промислова, 5",
    notes: "Постачальник цементу",
  });
  ws.addRow({
    name: "ФОП Іваненко Петро",
    type: "ФОП",
    taxId: "1234567890",
    phone: "+380671234567",
    email: "",
    address: "",
    notes: "",
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ======== Subcontractors ========

export type SubcontractorImportRow = {
  name: string;
  specialty: string;
  phone: string | null;
  email: string | null;
  rateType: "PER_HOUR" | "PER_DAY" | "PER_MONTH" | "PER_SQM" | "PER_PIECE";
  rateAmount: number | null;
  rateUnit: string | null;
  availableFrom: Date | null;
  notes: string | null;
  isActive: boolean;
};

export async function parseSubcontractorsExcel(
  buffer: Buffer,
): Promise<ImportResult<SubcontractorImportRow>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("Excel файл порожній");

  const { headers, totalRows } = readRow(ws);
  const cols = {
    name: matchColumn(headers, (h) =>
      includesAny(h, ["піб", "name", "фио", "ім'я", "імʼя"]),
    ),
    specialty: matchColumn(headers, (h) =>
      includesAny(h, ["спеціальність", "specialty", "фах"]),
    ),
    phone: matchColumn(headers, (h) => includesAny(h, ["телефон", "phone"])),
    email: matchColumn(headers, (h) => includesAny(h, ["email", "пошта", "e-mail"])),
    rateType: matchColumn(headers, (h) =>
      includesAny(h, ["тип тарифу", "rate type", "тип розрахунк"]),
    ),
    rateAmount: matchColumn(headers, (h) =>
      includesAny(h, ["сума", "тариф", "ставка", "ціна", "rate"]),
    ),
    rateUnit: matchColumn(headers, (h) =>
      includesAny(h, ["одиниця", "unit"]),
    ),
    availableFrom: matchColumn(headers, (h) =>
      includesAny(h, ["доступн", "available", "з "]),
    ),
    notes: matchColumn(headers, (h) => includesAny(h, ["коментар", "notes", "примітк"])),
  };

  if (cols.name === undefined) {
    throw new Error("Відсутня обовʼязкова колонка: ПІБ");
  }
  if (cols.specialty === undefined) {
    throw new Error("Відсутня обовʼязкова колонка: Спеціальність");
  }

  const data: SubcontractorImportRow[] = [];
  const errors: ImportError[] = [];

  for (let r = 2; r <= totalRows; r++) {
    const name = cellValue(ws, r, cols.name);
    if (!name) continue;
    const specialty = cellValue(ws, r, cols.specialty);
    if (!specialty) {
      errors.push({ row: r, field: "specialty", message: "Порожня спеціальність" });
      continue;
    }

    const rateTypeRaw = normalize(cellValue(ws, r, cols.rateType));
    let rateType: SubcontractorImportRow["rateType"] = "PER_DAY";
    if (rateTypeRaw.includes("год") || rateTypeRaw.includes("hour")) rateType = "PER_HOUR";
    else if (rateTypeRaw.includes("міс") || rateTypeRaw.includes("month")) rateType = "PER_MONTH";
    else if (rateTypeRaw.includes("м²") || rateTypeRaw.includes("кв") || rateTypeRaw.includes("sqm")) rateType = "PER_SQM";
    else if (rateTypeRaw.includes("шт") || rateTypeRaw.includes("piece")) rateType = "PER_PIECE";

    const emailRaw = cellValue(ws, r, cols.email);
    if (emailRaw && !emailValid(emailRaw)) {
      errors.push({ row: r, field: "email", message: "Невірний email" });
      continue;
    }

    data.push({
      name,
      specialty,
      phone: cellValue(ws, r, cols.phone) || null,
      email: emailRaw || null,
      rateType,
      rateAmount: parseNumber(cellValue(ws, r, cols.rateAmount)),
      rateUnit: cellValue(ws, r, cols.rateUnit) || null,
      availableFrom: parseDate(cellValue(ws, r, cols.availableFrom)),
      notes: cellValue(ws, r, cols.notes) || null,
      isActive: true,
    });
  }

  return { data, errors, totalRows: totalRows - 1, validRows: data.length };
}

export async function generateSubcontractorsTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Підрядники");
  ws.columns = [
    { header: "ПІБ *", key: "name", width: 32 },
    { header: "Спеціальність *", key: "specialty", width: 22 },
    { header: "Телефон", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 26 },
    { header: "Тип тарифу (година/день/місяць/м²/штука)", key: "rateType", width: 36 },
    { header: "Сума", key: "rateAmount", width: 12 },
    { header: "Одиниця (грн/м²)", key: "rateUnit", width: 18 },
    { header: "Доступний з (DD.MM.YYYY)", key: "availableFrom", width: 22 },
    { header: "Коментар", key: "notes", width: 30 },
  ];
  styleHeader(ws);
  ws.addRow({
    name: "Василь Коваль",
    specialty: "Плиточник",
    phone: "+380501112233",
    email: "",
    rateType: "м²",
    rateAmount: 700,
    rateUnit: "грн/м²",
    availableFrom: "01.05.2026",
    notes: "Вільний з квітня",
  });
  ws.addRow({
    name: "Андрій Мельник",
    specialty: "Електрик",
    phone: "+380671234567",
    email: "",
    rateType: "день",
    rateAmount: 2500,
    rateUnit: "грн/день",
    availableFrom: "",
    notes: "",
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ======== Mapping-based appliers (used after AI inference) ========

type ColumnMap = Record<string, number | null>;

function pick(rows: string[][], rowIdx: number, col: number | null | undefined): string {
  if (col === null || col === undefined) return "";
  return (rows[rowIdx]?.[col - 1] ?? "").trim();
}

export function applyEmployeeMapping(
  rows: string[][],
  headerRow: number,
  cols: ColumnMap,
): ImportResult<EmployeeImportRow> {
  const data: EmployeeImportRow[] = [];
  const errors: ImportError[] = [];
  const startIdx = Math.max(headerRow, 0);

  for (let i = startIdx; i < rows.length; i++) {
    const fullName = pick(rows, i, cols.fullName);
    if (!fullName) continue;

    const emailRaw = pick(rows, i, cols.email);
    if (emailRaw && !emailValid(emailRaw)) {
      errors.push({ row: i + 1, field: "email", message: "Невірний email" });
      continue;
    }

    const salaryTypeRaw = normalize(pick(rows, i, cols.salaryType));
    const salaryType: "MONTHLY" | "HOURLY" =
      salaryTypeRaw.includes("год") || salaryTypeRaw.includes("hour") ? "HOURLY" : "MONTHLY";

    data.push({
      fullName,
      phone: pick(rows, i, cols.phone) || null,
      email: emailRaw || null,
      position: pick(rows, i, cols.position) || null,
      birthDate: parseDate(pick(rows, i, cols.birthDate)),
      residence: pick(rows, i, cols.residence) || null,
      maritalStatus: pick(rows, i, cols.maritalStatus) || null,
      hiredAt: parseDate(pick(rows, i, cols.hiredAt)),
      terminatedAt: parseDate(pick(rows, i, cols.terminatedAt)),
      salaryType,
      salaryAmount: parseNumber(pick(rows, i, cols.salaryAmount)),
      currency: pick(rows, i, cols.currency) || "UAH",
      extraData: pick(rows, i, cols.extraData) || null,
      notes: pick(rows, i, cols.notes) || null,
      isActive: true,
    });
  }

  return { data, errors, totalRows: rows.length - startIdx, validRows: data.length };
}

export function applyCounterpartyMapping(
  rows: string[][],
  headerRow: number,
  cols: ColumnMap,
): ImportResult<CounterpartyImportRow> {
  const data: CounterpartyImportRow[] = [];
  const errors: ImportError[] = [];
  const startIdx = Math.max(headerRow, 0);

  for (let i = startIdx; i < rows.length; i++) {
    const name = pick(rows, i, cols.name);
    if (!name) continue;

    const typeRaw = normalize(pick(rows, i, cols.type));
    let type: "LEGAL" | "INDIVIDUAL" | "FOP" = "LEGAL";
    if (typeRaw.includes("фоп") || typeRaw === "fop") type = "FOP";
    else if (typeRaw.includes("фіз") || typeRaw.includes("individual")) type = "INDIVIDUAL";

    const emailRaw = pick(rows, i, cols.email);
    if (emailRaw && !emailValid(emailRaw)) {
      errors.push({ row: i + 1, field: "email", message: "Невірний email" });
      continue;
    }

    data.push({
      name,
      type,
      taxId: pick(rows, i, cols.taxId) || null,
      phone: pick(rows, i, cols.phone) || null,
      email: emailRaw || null,
      address: pick(rows, i, cols.address) || null,
      notes: pick(rows, i, cols.notes) || null,
      isActive: true,
    });
  }

  return { data, errors, totalRows: rows.length - startIdx, validRows: data.length };
}

export function applySubcontractorMapping(
  rows: string[][],
  headerRow: number,
  cols: ColumnMap,
): ImportResult<SubcontractorImportRow> {
  const data: SubcontractorImportRow[] = [];
  const errors: ImportError[] = [];
  const startIdx = Math.max(headerRow, 0);

  for (let i = startIdx; i < rows.length; i++) {
    const name = pick(rows, i, cols.name);
    if (!name) continue;
    const specialty = pick(rows, i, cols.specialty);
    if (!specialty) {
      errors.push({ row: i + 1, field: "specialty", message: "Порожня спеціальність" });
      continue;
    }

    const rateTypeRaw = normalize(pick(rows, i, cols.rateType));
    let rateType: SubcontractorImportRow["rateType"] = "PER_DAY";
    if (rateTypeRaw.includes("год") || rateTypeRaw.includes("hour")) rateType = "PER_HOUR";
    else if (rateTypeRaw.includes("міс") || rateTypeRaw.includes("month")) rateType = "PER_MONTH";
    else if (rateTypeRaw.includes("м²") || rateTypeRaw.includes("кв") || rateTypeRaw.includes("sqm"))
      rateType = "PER_SQM";
    else if (rateTypeRaw.includes("шт") || rateTypeRaw.includes("piece")) rateType = "PER_PIECE";

    const emailRaw = pick(rows, i, cols.email);
    if (emailRaw && !emailValid(emailRaw)) {
      errors.push({ row: i + 1, field: "email", message: "Невірний email" });
      continue;
    }

    data.push({
      name,
      specialty,
      phone: pick(rows, i, cols.phone) || null,
      email: emailRaw || null,
      rateType,
      rateAmount: parseNumber(pick(rows, i, cols.rateAmount)),
      rateUnit: pick(rows, i, cols.rateUnit) || null,
      availableFrom: parseDate(pick(rows, i, cols.availableFrom)),
      notes: pick(rows, i, cols.notes) || null,
      isActive: true,
    });
  }

  return { data, errors, totalRows: rows.length - startIdx, validRows: data.length };
}

// ======== Field specs (для AI mapper) ========

export const EMPLOYEE_FIELDS = [
  { key: "fullName", label: "ПІБ", required: true, hint: "Прізвище Імʼя По-батькові; інколи розбито на колонки" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "position", label: "Посада" },
  { key: "birthDate", label: "Дата народження", hint: "Дата у будь-якому форматі (DD.MM.YYYY, ISO, тощо)" },
  { key: "residence", label: "Місце проживання / адреса" },
  { key: "maritalStatus", label: "Сімейний стан", hint: "Одружений / неодружена / розлучений / вдівець" },
  { key: "hiredAt", label: "Початок роботи / дата прийому", hint: "Дата" },
  { key: "terminatedAt", label: "Дата звільнення / кінець роботи", hint: "Дата; пусто якщо працює" },
  { key: "salaryType", label: "Тип ЗП", hint: "Місячна / погодинна / hourly / monthly" },
  { key: "salaryAmount", label: "Сума ЗП", hint: "Число" },
  { key: "currency", label: "Валюта" },
  { key: "extraData", label: "Додаткові дані" },
  { key: "notes", label: "Коментар" },
];

export const COUNTERPARTY_FIELDS = [
  { key: "name", label: "Назва", required: true },
  { key: "type", label: "Тип контрагента", hint: "Юр / фіз / ФОП" },
  { key: "taxId", label: "ЄДРПОУ або ІПН" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "address", label: "Адреса" },
  { key: "notes", label: "Коментар" },
];

export const SUBCONTRACTOR_FIELDS = [
  { key: "name", label: "ПІБ", required: true },
  { key: "specialty", label: "Спеціальність / фах", required: true },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "rateType", label: "Тип тарифу", hint: "година / день / місяць / м² / штука" },
  { key: "rateAmount", label: "Сума тарифу", hint: "Число" },
  { key: "rateUnit", label: "Одиниця (грн/м², грн/год)" },
  { key: "availableFrom", label: "Доступний з (дата)" },
  { key: "notes", label: "Коментар" },
];

// ======== Shared header styling ========

function styleHeader(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3B5BFF" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 26;
}
