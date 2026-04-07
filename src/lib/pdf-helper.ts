/**
 * Helper для роботи з PDF файлами
 * Вирішує проблеми з динамічним імпортом pdf-parse
 */

/**
 * Парсить PDF файл і витягує текст
 */
export async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages?: number }> {
  try {
    // Dynamic import pdf-parse
    const pdfParse = await import('pdf-parse');

    // Try different export patterns
    let parseFn;
    if (typeof pdfParse === 'function') {
      parseFn = pdfParse;
    } else if (typeof (pdfParse as any).default === 'function') {
      parseFn = (pdfParse as any).default;
    } else if (typeof (pdfParse as any).default?.default === 'function') {
      parseFn = (pdfParse as any).default.default;
    } else {
      // Fallback: return empty
      console.error('PDF parse error: Could not find parse function in module');
      return { text: '', numpages: 0 };
    }

    const data = await parseFn(buffer);
    return { text: data.text, numpages: data.numpages };
  } catch (error) {
    console.error('PDF parse error:', error);
    return { text: '', numpages: 0 };
  }
}
