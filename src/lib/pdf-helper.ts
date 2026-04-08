/**
 * Helper для роботи з PDF файлами
 * Використовує Gemini Vision для читання PDF (працює навіть для сканованих документів)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Парсить PDF файл і витягує текст через Gemini Vision
 * Працює для всіх типів PDF: текстові, скановані, креслення
 */
export async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages?: number }> {
  try {
    console.log(`📄 Початок парсингу PDF через Gemini Vision, розмір: ${buffer.length} bytes`);

    if (!buffer || buffer.length === 0) {
      throw new Error('PDF buffer порожній');
    }

    // Використовуємо Gemini Vision для читання PDF
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
    });

    const prompt = `Витягни ВЕСЬ текст з цього PDF документу.

ВАЖЛИВО:
- Прочитай ВСІ сторінки
- Зберігай структуру (заголовки, списки, таблиці)
- Витягуй ВСІ цифри, розміри, діаметри, марки матеріалів
- Якщо це креслення - опиши розміри та позначки
- Якщо це специфікація - витягни таблицю повністю
- Якщо це геологічний звіт - витягни всі дані про грунт, УГВ

ФОРМАТ ВІДПОВІДІ:
Просто весь текст документу, зберігаючи структуру.

Не додавай жодних коментарів - тільки текст з PDF.`;

    console.log(`🤖 Відправка PDF в Gemini Vision...`);

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: 'application/pdf'
        }
      }
    ]);

    const text = result.response.text();

    console.log(`✅ PDF успішно прочитано через Gemini: ${text.length} символів`);

    if (!text || text.length < 50) {
      console.warn('⚠️ PDF прочитано, але текст занадто короткий');
      throw new Error('PDF містить занадто мало тексту або порожній');
    }

    // Оцінюємо кількість сторінок (приблизно)
    const estimatedPages = Math.max(1, Math.ceil(text.length / 2000));

    return {
      text,
      numpages: estimatedPages
    };

  } catch (error) {
    console.error('❌ Gemini PDF parse error:', error);
    console.error('Buffer info:', {
      length: buffer?.length,
      isBuffer: Buffer.isBuffer(buffer),
      firstBytes: buffer?.slice(0, 10).toString('hex')
    });

    throw new Error(`Не вдалось прочитати PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
