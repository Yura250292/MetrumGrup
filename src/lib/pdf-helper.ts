/**
 * Helper для роботи з PDF файлами
 * Вирішує проблеми з динамічним імпортом pdf-parse
 */

/**
 * Парсить PDF файл і витягує текст
 */
export async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages?: number }> {
  try {
    // Dynamic import pdf-parse each time
    const pdfParse = await import('pdf-parse');
    // pdf-parse exports the function directly in ESM
    const parseFn = (pdfParse as any).default || pdfParse;
    const data = await parseFn(buffer);
    return { text: data.text, numpages: data.numpages };
  } catch (error) {
    console.error('PDF parse error:', error);
    return { text: '', numpages: 0 };
  }
}
