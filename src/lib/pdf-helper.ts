/**
 * Helper для роботи з PDF файлами.
 *
 * Стратегія (3 рівні fallback):
 *   1. PRIMARY: pdf-parse — швидкий text extraction з текстових PDF
 *      (~50ms, 0 tokens, не залежить від зовнішніх API)
 *   2. FALLBACK для сканованих PDF: Gemini Vision з retry
 *      (якщо pdf-parse повернув <100 символів тексту — PDF ймовірно сканований)
 *   3. RETRY: при 503/429 від Gemini — 3 спроби з експоненційним backoff
 *
 * Це вирішує проблему "Не вдалось прочитати PDF: 503 Service Unavailable"
 * яка траплялась коли Gemini був перевантажений.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable (503, 429, network errors).
 */
function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /503|429|overload|high demand|rate limit|ECONNRESET|ETIMEDOUT|network/i.test(msg);
}

/**
 * Try to extract text from PDF using pdf-parse (fast, local, no API).
 * Returns null if extraction fails or text is too short (likely scanned).
 */
async function tryPdfParse(buffer: Buffer): Promise<{ text: string; numpages: number } | null> {
  try {
    // Dynamic import to avoid top-level load issues on serverless cold start
    const pdfParseModule = await import('pdf-parse');
    const PDFParse = (pdfParseModule as any).PDFParse;
    if (!PDFParse) {
      console.warn('⚠️ pdf-parse PDFParse class not available');
      return null;
    }

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = (result.text ?? '').trim();
    const numpages = result.pages?.length ?? 0;

    console.log(`📄 pdf-parse: ${text.length} символів, ${numpages} сторінок`);

    // If text is too short, PDF is probably scanned — need Gemini Vision
    if (text.length < 100) {
      console.warn(`⚠️ pdf-parse text too short (${text.length} chars), fallback to Gemini Vision`);
      return null;
    }

    return { text, numpages };
  } catch (error) {
    console.warn('⚠️ pdf-parse failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fallback: use Gemini Vision for scanned PDFs.
 * Retries 3 times on 503/429 errors with exponential backoff.
 */
async function geminiVisionParse(buffer: Buffer): Promise<{ text: string; numpages: number }> {
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

  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🤖 Gemini Vision [спроба ${attempt}/${maxAttempts}]...`);

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
      console.log(`✅ Gemini Vision: ${text.length} символів`);

      if (!text || text.length < 50) {
        throw new Error('Gemini повернув порожній або занадто короткий текст');
      }

      const estimatedPages = Math.max(1, Math.ceil(text.length / 2000));
      return { text, numpages: estimatedPages };
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);

      if (isRetryable(error) && attempt < maxAttempts) {
        const delayMs = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        console.warn(`⚠️ Gemini Vision retryable error (спроба ${attempt}): ${msg.substring(0, 100)}. Чекаю ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }

      // Non-retryable or last attempt
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Main PDF parsing function.
 * Strategy: pdf-parse → Gemini Vision → error
 */
export async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages?: number }> {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF buffer порожній');
  }

  console.log(`📄 Парсинг PDF, розмір: ${Math.round(buffer.length / 1024)} KB`);

  // 1. Try fast local text extraction
  const fastResult = await tryPdfParse(buffer);
  if (fastResult) {
    return fastResult;
  }

  // 2. Fallback to Gemini Vision for scanned/image-based PDFs
  console.log(`🔄 Fallback: Gemini Vision (PDF ймовірно сканований або має зображення)`);

  try {
    return await geminiVisionParse(buffer);
  } catch (error) {
    console.error('❌ Всі методи парсингу PDF провалились:', error);
    console.error('Buffer info:', {
      length: buffer.length,
      isBuffer: Buffer.isBuffer(buffer),
      firstBytes: buffer.slice(0, 10).toString('hex')
    });

    // Return empty result instead of throwing — let the pipeline continue
    // with other files. The project might still be estimated from wizard + other docs.
    console.warn('⚠️ Повертаю порожній результат щоб pipeline не впав');
    return {
      text: `[PDF не вдалось прочитати: ${error instanceof Error ? error.message : 'unknown'}]`,
      numpages: 0,
    };
  }
}
