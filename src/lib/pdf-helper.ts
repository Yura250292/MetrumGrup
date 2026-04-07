/**
 * Helper для роботи з PDF файлами
 * Вирішує проблеми з динамічним імпортом pdf-parse
 */

/**
 * Парсить PDF файл і витягує текст
 */
export async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages?: number }> {
  try {
    // Dynamic import pdf-parse (it's a CommonJS module)
    const pdfParse = await import('pdf-parse');

    // pdf-parse exports as default in CommonJS
    // In ESM dynamic import, it becomes pdfParse.default
    const parseFn = (pdfParse as any).default || pdfParse;

    // Call the parser
    const data = await parseFn(buffer);
    return { text: data.text || '', numpages: data.numpages || 0 };
  } catch (error) {
    console.error('PDF parse error:', error);
    // Return empty instead of failing completely
    return { text: '', numpages: 0 };
  }
}
