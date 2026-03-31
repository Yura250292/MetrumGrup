import ExcelJS from "exceljs";

export interface MaterialImportRow {
  name: string;
  sku: string;
  category: string;
  unit: string;
  basePrice: number;
  laborRate: number;
  markup: number;
  description?: string;
  rowNumber: number;
}

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

export interface MaterialImportResult {
  data: MaterialImportRow[];
  errors: ImportValidationError[];
  totalRows: number;
  validRows: number;
}

/**
 * Парсить Excel файл з матеріалами
 */
export async function parseMaterialsExcel(buffer: Buffer): Promise<MaterialImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Excel файл порожній");
  }

  const data: MaterialImportRow[] = [];
  const errors: ImportValidationError[] = [];

  // Очікуємо що перший рядок - заголовки
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value || "").trim().toLowerCase();
  });

  // Мапінг колонок (підтримка різних варіантів назв)
  const columnMapping: Record<string, number> = {};
  headers.forEach((header, index) => {
    if (header.includes("назва") || header === "name" || header === "найменування") {
      columnMapping.name = index;
    } else if (header.includes("артикул") || header === "sku" || header === "код") {
      columnMapping.sku = index;
    } else if (header.includes("категор") || header === "category" || header === "тип") {
      columnMapping.category = index;
    } else if (header.includes("од") || header === "unit" || header.includes("вимір")) {
      columnMapping.unit = index;
    } else if (header.includes("ціна") || header === "price" || header.includes("вартість")) {
      columnMapping.basePrice = index;
    } else if (header.includes("робот") || header === "labor" || header.includes("праці")) {
      columnMapping.laborRate = index;
    } else if (header.includes("націн") || header === "markup" || header.includes("маржа")) {
      columnMapping.markup = index;
    } else if (header.includes("опис") || header === "description" || header === "примітка") {
      columnMapping.description = index;
    }
  });

  // Перевірка обов'язкових колонок
  const requiredColumns = ["name", "sku", "category", "unit", "basePrice"];
  const missingColumns = requiredColumns.filter((col) => !columnMapping[col]);

  if (missingColumns.length > 0) {
    throw new Error(
      `Відсутні обов'язкові колонки: ${missingColumns.join(", ")}. ` +
        `Переконайтесь що Excel має колонки: Назва, Артикул, Категорія, Од. виміру, Ціна`
    );
  }

  // Парсинг даних (починаючи з рядка 2)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Пропускаємо заголовок

    const rowData: Partial<MaterialImportRow> = { rowNumber };
    const rowErrors: ImportValidationError[] = [];

    // Зчитуємо дані
    const getCellValue = (colIndex: number): string => {
      if (!colIndex) return "";
      const cell = row.getCell(colIndex);
      return String(cell.value || "").trim();
    };

    rowData.name = getCellValue(columnMapping.name);
    rowData.sku = getCellValue(columnMapping.sku);
    rowData.category = getCellValue(columnMapping.category);
    rowData.unit = getCellValue(columnMapping.unit);
    rowData.description = getCellValue(columnMapping.description) || undefined;

    // Валідація обов'язкових полів
    if (!rowData.name) {
      rowErrors.push({ row: rowNumber, field: "name", message: "Відсутня назва" });
    }
    if (!rowData.sku) {
      rowErrors.push({ row: rowNumber, field: "sku", message: "Відсутній артикул" });
    }
    if (!rowData.category) {
      rowErrors.push({ row: rowNumber, field: "category", message: "Відсутня категорія" });
    }
    if (!rowData.unit) {
      rowErrors.push({ row: rowNumber, field: "unit", message: "Відсутня од. виміру" });
    }

    // Парсинг числових полів
    const parseNumber = (colIndex: number, fieldName: string, defaultValue: number = 0): number => {
      if (!colIndex) return defaultValue;
      const value = getCellValue(colIndex);
      if (!value) return defaultValue;

      const parsed = parseFloat(value.replace(/[^\d.-]/g, ""));
      if (isNaN(parsed)) {
        rowErrors.push({ row: rowNumber, field: fieldName, message: `Некоректне число: ${value}` });
        return defaultValue;
      }
      return parsed;
    };

    rowData.basePrice = parseNumber(columnMapping.basePrice, "basePrice");
    rowData.laborRate = parseNumber(columnMapping.laborRate, "laborRate", 0);
    rowData.markup = parseNumber(columnMapping.markup, "markup", 0);

    if (rowData.basePrice === undefined || rowData.basePrice <= 0) {
      rowErrors.push({ row: rowNumber, field: "basePrice", message: "Ціна повинна бути більше 0" });
    }

    // Додаємо помилки якщо є
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else if (rowData.name && rowData.sku && rowData.category && rowData.unit) {
      // Додаємо валідний рядок
      data.push(rowData as MaterialImportRow);
    }
  });

  return {
    data,
    errors,
    totalRows: worksheet.rowCount - 1, // Мінус заголовок
    validRows: data.length,
  };
}

/**
 * Генерує шаблон Excel для імпорту матеріалів
 */
export async function generateMaterialsTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Матеріали");

  // Заголовки
  worksheet.columns = [
    { header: "Назва *", key: "name", width: 40 },
    { header: "Артикул *", key: "sku", width: 15 },
    { header: "Категорія *", key: "category", width: 20 },
    { header: "Од. виміру *", key: "unit", width: 12 },
    { header: "Ціна (грн) *", key: "basePrice", width: 15 },
    { header: "Вартість робіт (грн/од)", key: "laborRate", width: 20 },
    { header: "Націнка (%)", key: "markup", width: 12 },
    { header: "Опис", key: "description", width: 30 },
  ];

  // Стилізація заголовків
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFF8400" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 25;

  // Приклади даних
  worksheet.addRow({
    name: "Цемент ПЦ-400",
    sku: "CEM-001",
    category: "Будівельні матеріали",
    unit: "кг",
    basePrice: 8.5,
    laborRate: 0,
    markup: 15,
    description: "Портландцемент марки 400",
  });

  worksheet.addRow({
    name: "Пісок будівельний",
    sku: "SND-001",
    category: "Будівельні матеріали",
    unit: "м³",
    basePrice: 450,
    laborRate: 100,
    markup: 20,
    description: "Пісок річковий середньої фракції",
  });

  worksheet.addRow({
    name: "Цегла червона",
    sku: "BRK-001",
    category: "Будівельні матеріали",
    unit: "шт",
    basePrice: 12,
    laborRate: 2,
    markup: 25,
    description: "Цегла керамічна рядова",
  });

  // Примітка
  worksheet.addRow([]);
  const noteRow = worksheet.addRow([
    "* - обов'язкові поля",
    "",
    "",
    "",
    "",
    "",
    "",
    "Видаліть приклади перед імпортом",
  ]);
  noteRow.font = { italic: true, color: { argb: "FF666666" }, size: 9, name: "Arial" };

  // Форматування чисел
  worksheet.getColumn(5).numFmt = "#,##0.00"; // basePrice
  worksheet.getColumn(6).numFmt = "#,##0.00"; // laborRate
  worksheet.getColumn(7).numFmt = "0.00"; // markup

  // Бордери для прикладів
  for (let i = 2; i <= 4; i++) {
    worksheet.getRow(i).eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Генерує Excel з поточними матеріалами для експорту
 */
export async function exportMaterialsToExcel(
  materials: Array<{
    name: string;
    sku: string;
    category: string;
    unit: string;
    basePrice: number;
    laborRate: number;
    markup: number;
    description: string | null;
    isActive: boolean;
  }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Матеріали");

  // Заголовки
  worksheet.columns = [
    { header: "Назва", key: "name", width: 40 },
    { header: "Артикул", key: "sku", width: 15 },
    { header: "Категорія", key: "category", width: 20 },
    { header: "Од. виміру", key: "unit", width: 12 },
    { header: "Ціна (грн)", key: "basePrice", width: 15 },
    { header: "Вартість робіт (грн/од)", key: "laborRate", width: 20 },
    { header: "Націнка (%)", key: "markup", width: 12 },
    { header: "Опис", key: "description", width: 30 },
    { header: "Активний", key: "isActive", width: 12 },
  ];

  // Стилізація заголовків
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFF8400" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 25;

  // Додаємо дані
  materials.forEach((material) => {
    const row = worksheet.addRow({
      name: material.name,
      sku: material.sku,
      category: material.category,
      unit: material.unit,
      basePrice: material.basePrice,
      laborRate: material.laborRate,
      markup: material.markup,
      description: material.description || "",
      isActive: material.isActive ? "Так" : "Ні",
    });

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  // Форматування чисел
  worksheet.getColumn(5).numFmt = "#,##0.00"; // basePrice
  worksheet.getColumn(6).numFmt = "#,##0.00"; // laborRate
  worksheet.getColumn(7).numFmt = "0.00"; // markup

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
