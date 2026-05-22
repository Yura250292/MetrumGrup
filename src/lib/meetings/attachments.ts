/**
 * Спільна логіка вкладень нарад — типи файлів, валідація, категоризація.
 * Чисті функції без серверних залежностей — безпечно імпортувати і в UI,
 * і в API-роутах (upload-url / attachments).
 *
 * AI-підсумок наради ці файли НЕ читає — це довідкові матеріали
 * (фото дошки, PDF-протокол, Excel-таблиця тощо).
 */

/** Максимальний розмір одного вкладення — 50 MB. */
export const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export type AttachmentKind =
  | "image"
  | "pdf"
  | "spreadsheet"
  | "document"
  | "other";

/**
 * Розширення → категорія. Усе, чого тут немає (і що не image/* чи PDF
 * за MIME), вважається непідтримуваним — див. isAllowedAttachment.
 */
const KIND_BY_EXT: Record<string, AttachmentKind> = {
  // Зображення
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  svg: "image",
  heic: "image",
  heif: "image",
  // PDF
  pdf: "pdf",
  // Таблиці
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  csv: "spreadsheet",
  ods: "spreadsheet",
  // Документи
  doc: "document",
  docx: "document",
  txt: "document",
  rtf: "document",
  md: "document",
  odt: "document",
  ppt: "document",
  pptx: "document",
};

/** Значення для атрибута accept у <input type="file">. */
export const ATTACHMENT_ACCEPT = Object.keys(KIND_BY_EXT)
  .map((e) => `.${e}`)
  .concat("image/*", "application/pdf")
  .join(",");

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Категорія вкладення для іконки/групування. */
export function attachmentKindFor(
  mimeType: string,
  fileName: string,
): AttachmentKind {
  const byExt = KIND_BY_EXT[fileExtension(fileName)];
  if (byExt) return byExt;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return "spreadsheet";
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("presentation")
  ) {
    return "document";
  }
  return "other";
}

/** Чи дозволено приймати такий файл як вкладення наради. */
export function isAllowedAttachment(
  mimeType: string,
  fileName: string,
): boolean {
  if (KIND_BY_EXT[fileExtension(fileName)]) return true;
  // Деякі камери/застосунки зберігають файли без розширення — дозволяємо
  // за MIME-типом.
  if (mimeType.startsWith("image/")) return true;
  if (mimeType === "application/pdf") return true;
  return false;
}

/** Людино-читаний розмір файлу. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
