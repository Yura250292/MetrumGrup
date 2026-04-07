/**
 * Helper для роботи з PDF файлами
 * Вирішує проблеми з динамічним імпортом pdf-parse
 */

let pdfParseInstance: any = null;

/**
 * Парсить PDF файл і витягує текст
 */
export async function parsePDF(buffer: Buffer): Promise<{ text: string }> {
  // Lazy load pdf-parse тільки один раз
  if (!pdfParseInstance) {
    const pdfModule = await import('pdf-parse');
    pdfParseInstance = pdfModule.default || pdfModule;
  }

  try {
    const data = await pdfParseInstance(buffer);
    return { text: data.text };
  } catch (error) {
    console.error('PDF parse error:', error);
    return { text: '' };
  }
}
