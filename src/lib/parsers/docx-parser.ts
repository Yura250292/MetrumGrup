const MAX_DOCX_BYTES = 8 * 1024 * 1024;

export type DocxExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "TOO_LARGE" | "LEGACY_DOC" | "EMPTY" | "PARSE_ERROR"; message: string };

export function isLegacyDoc(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".doc") && !lower.endsWith(".docx");
}

export function isDocx(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".docx") || lower.endsWith(".odt");
}

export async function extractDocxText(
  buffer: Buffer,
  fileName: string,
): Promise<DocxExtractResult> {
  if (isLegacyDoc(fileName)) {
    return {
      ok: false,
      reason: "LEGACY_DOC",
      message: `Формат .doc (Word 97-2003) застарілий і не підтримується. Конвертуйте файл у .docx або PDF.`,
    };
  }

  if (buffer.byteLength > MAX_DOCX_BYTES) {
    return {
      ok: false,
      reason: "TOO_LARGE",
      message: `Файл ${fileName}: документ перевищує 8 MB.`,
    };
  }

  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    const cleaned = value.trim();
    if (!cleaned) {
      return { ok: false, reason: "EMPTY", message: `Файл ${fileName}: документ без тексту.` };
    }
    return { ok: true, text: cleaned };
  } catch (err) {
    return {
      ok: false,
      reason: "PARSE_ERROR",
      message: `Файл ${fileName}: не вдалось прочитати документ (${
        err instanceof Error ? err.message : "?"
      }).`,
    };
  }
}
