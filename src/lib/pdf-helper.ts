/**
 * Helper для роботи з PDF файлами
 * Вирішує проблеми з динамічним імпортом pdf-parse
 */

/**
 * Парсить PDF файл і витягує текст
 */
export async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages?: number }> {
  try {
    console.log(`📄 Початок парсингу PDF, розмір буфера: ${buffer.length} bytes`);

    if (!buffer || buffer.length === 0) {
      throw new Error('PDF buffer порожній');
    }

    // Dynamic import pdf-parse (it's a CommonJS module)
    const pdfParse = await import('pdf-parse');

    // pdf-parse exports as default in CommonJS
    // In ESM dynamic import, it becomes pdfParse.default
    const parseFn = (pdfParse as any).default || pdfParse;

    console.log(`📄 PDF-parse завантажено, починаю парсинг...`);

    // Call the parser
    const data = await parseFn(buffer);

    console.log(`✅ PDF успішно розпарсено: ${data.text?.length || 0} символів, ${data.numpages || 0} сторінок`);

    if (!data.text || data.text.length === 0) {
      console.warn('⚠️ PDF розпарсено, але текст порожній (можливо скановані документи або зображення)');
    }

    return { text: data.text || '', numpages: data.numpages || 0 };
  } catch (error) {
    console.error('❌ PDF parse error:', error);
    console.error('Buffer info:', {
      length: buffer?.length,
      isBuffer: Buffer.isBuffer(buffer),
      firstBytes: buffer?.slice(0, 10).toString('hex')
    });

    // ВАЖЛИВО: НЕ повертаємо пусте значення - викидаємо помилку!
    throw new Error(`Не вдалось прочитати PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
