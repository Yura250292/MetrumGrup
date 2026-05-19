/**
 * Zero Price Fixer Service
 *
 * Після генерації кошторису знаходить позиції з unitPrice = 0
 * і намагається знайти ціни через ІНШУ AI модель:
 *   - Якщо основна модель була OpenAI → шукає через Gemini
 *   - Якщо основна модель була Gemini → шукає через OpenAI
 *
 * Це дає "другу думку" по ціні від альтернативної моделі.
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { EstimateSection, EstimateItem } from '../agents/base-agent';

export interface ZeroPriceFixResult {
  fixedCount: number;
  totalZeroItems: number;
  fixedItems: Array<{
    sectionTitle: string;
    description: string;
    newPrice: number;
    source: string;
    confidence: number;
  }>;
  unfixedItems: Array<{
    sectionTitle: string;
    description: string;
    reason: string;
  }>;
}

interface ZeroItem {
  sectionIndex: number;
  sectionTitle: string;
  itemIndex: number;
  description: string;
  unit: string;
  quantity: number;
}

interface PriceLookup {
  unitPrice: number;
  confidence: number;
  /** true — ціну реально знайдено на сторінці магазину (Google Search). */
  verified: boolean;
  /** Джерело: "Епіцентр (2026-05)" або "AI-оцінка (не підтверджено)". */
  source: string;
  /** Короткий опис: магазин, дата, URL. */
  reason?: string;
}

export class ZeroPriceFixer {
  /**
   * Знайти всі позиції з нульовою ціною і спробувати знайти ціни
   * через альтернативну AI модель
   */
  async fix(
    sections: EstimateSection[],
    primaryModel: 'openai' | 'gemini' = 'openai',
    context?: { objectType?: string; area?: string; region?: string; budgetRange?: string }
  ): Promise<ZeroPriceFixResult> {
    // 1. Знайти всі zero-price items
    const zeroItems = this.findZeroPriceItems(sections);

    if (zeroItems.length === 0) {
      console.log('✅ ZeroPriceFixer: Немає позицій з нульовою ціною');
      return { fixedCount: 0, totalZeroItems: 0, fixedItems: [], unfixedItems: [] };
    }

    console.log(`🔍 ZeroPriceFixer: Знайдено ${zeroItems.length} позицій з ціною 0₴`);

    // 2. Batch items in groups of 15 for efficient API calls
    const batches = this.batchItems(zeroItems, 15);
    const fixedItems: ZeroPriceFixResult['fixedItems'] = [];
    const unfixedItems: ZeroPriceFixResult['unfixedItems'] = [];

    // 3. Choose fallback model
    const fallbackModel = primaryModel === 'openai' ? 'gemini' : 'openai';
    console.log(`🤖 ZeroPriceFixer: Основна модель: ${primaryModel}, фолбек: ${fallbackModel}`);

    // Жорсткий дедлайн — допошук цін (з Google Search) не має з'їсти весь
    // бюджет serverless-функції. Що не встигли — лишається без ціни.
    const deadline = Date.now() + 110_000;

    for (const batch of batches) {
      if (Date.now() > deadline) {
        console.warn(`⏱️ ZeroPriceFixer: дедлайн вичерпано — ${batch.length}+ позицій лишилось без допошуку`);
        for (const item of batch) {
          unfixedItems.push({
            sectionTitle: item.sectionTitle,
            description: item.description,
            reason: 'Допошук цін перервано за часом',
          });
        }
        continue;
      }
      try {
        const prices = await this.fetchPrices(batch, fallbackModel, context);

        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
          const price = prices[i];

          if (price && price.unitPrice > 0) {
            // Update the section item in-place
            const section = sections[item.sectionIndex];
            const estimateItem = section.items[item.itemIndex];
            estimateItem.unitPrice = price.unitPrice;
            estimateItem.totalCost = estimateItem.quantity * price.unitPrice + (estimateItem.laborCost || 0);
            estimateItem.priceSource = price.source;
            estimateItem.confidence = price.confidence;
            (estimateItem as any).priceNote = price.reason || price.source;

            // Recalculate section total
            section.sectionTotal = section.items.reduce((sum, it) => sum + it.totalCost, 0);

            fixedItems.push({
              sectionTitle: item.sectionTitle,
              description: item.description,
              newPrice: price.unitPrice,
              source: price.source,
              confidence: price.confidence,
            });
          } else {
            unfixedItems.push({
              sectionTitle: item.sectionTitle,
              description: item.description,
              reason: price?.reason || 'Ціну не вдалося знайти жодною моделлю',
            });
          }
        }
      } catch (error) {
        console.error('❌ ZeroPriceFixer: Batch failed:', error);
        for (const item of batch) {
          unfixedItems.push({
            sectionTitle: item.sectionTitle,
            description: item.description,
            reason: `Помилка API: ${error instanceof Error ? error.message : 'unknown'}`,
          });
        }
      }
    }

    console.log(`✅ ZeroPriceFixer: Виправлено ${fixedItems.length}/${zeroItems.length} позицій`);

    return {
      fixedCount: fixedItems.length,
      totalZeroItems: zeroItems.length,
      fixedItems,
      unfixedItems,
    };
  }

  // ============================================================
  // Find zero-price items
  // ============================================================

  private findZeroPriceItems(sections: EstimateSection[]): ZeroItem[] {
    const result: ZeroItem[] = [];

    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      for (let ii = 0; ii < section.items.length; ii++) {
        const item = section.items[ii];
        // "Без ціни" = і unitPrice, і laborCost = 0. У роботи unitPrice=0 —
        // це норма (вартість у laborCost), такі позиції НЕ чіпаємо.
        const noPrice =
          (item.unitPrice ?? 0) === 0 &&
          (item.laborCost ?? 0) === 0 &&
          item.quantity > 0;
        if (noPrice && item.description.trim().length > 0) {
          result.push({
            sectionIndex: si,
            sectionTitle: section.title,
            itemIndex: ii,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
          });
        }
      }
    }

    return result;
  }

  private batchItems(items: ZeroItem[], batchSize: number): ZeroItem[][] {
    const batches: ZeroItem[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  // ============================================================
  // Fetch prices from fallback model
  // ============================================================

  private async fetchPrices(
    items: ZeroItem[],
    _model: 'openai' | 'gemini',
    context?: { objectType?: string; area?: string; region?: string; budgetRange?: string }
  ): Promise<Array<PriceLookup | null>> {
    const itemsList = items.map((item, i) =>
      `${i + 1}. "${item.description}" (од.: ${item.unit}, к-сть: ${item.quantity}, секція: ${item.sectionTitle})`
    ).join('\n');

    const budgetLabel = context?.budgetRange
      ? { economy: 'ЕКОНОМ (найдешевші матеріали)', standard: 'СТАНДАРТ (середній сегмент)', premium: 'ПРЕМІУМ (якісні бренди)', luxury: 'ЛЮКС (топові європейські бренди)' }[context.budgetRange] ?? context.budgetRange
      : null;

    const contextStr = context
      ? `Тип об'єкта: ${context.objectType || 'будівництво'}, площа: ${context.area || 'невідомо'} м², регіон: ${context.region || 'Україна'}${budgetLabel ? `, клас якості: ${budgetLabel}` : ''}`
      : 'Будівельний кошторис, Україна, 2024-2025';

    const year = new Date().getFullYear();
    const prompt = `Ти — експерт з ціноутворення будівельних матеріалів і робіт в Україні.

Контекст: ${contextStr}

Для КОЖНОЇ позиції знайди РЕАЛЬНУ актуальну ціну за одиницю в гривнях (₴)
станом на ${year} рік. ВИКОРИСТОВУЙ Google Search — шукай у магазинах
(epicentrk.ua, prom.ua, leroymerlin.ua, obi.ua, novalinia, hozcenter тощо).
${budgetLabel ? `Клас якості проекту — ${budgetLabel}. Бери ціни відповідного сегменту.\n` : ''}

Позиції без цін:
${itemsList}

Поверни JSON масив з об'єктами для КОЖНОЇ позиції (в тому ж порядку):
[
  {
    "index": 1,
    "unitPrice": число_в_гривнях,
    "verified": true | false,
    "source": "магазин/сайт де знайдено ціну",
    "checkedDate": "${year}-MM",
    "url": "посилання на сторінку товару або пошуку",
    "confidence": 0.0-1.0,
    "note": "коментар"
  }
]

Правила:
- "verified": true — ЛИШЕ якщо ти реально знайшов ціну на конкретній сторінці
  (вкажи source + url). Інакше "verified": false і це оцінка.
- Ціна = ТІЛЬКИ за матеріал (без роботи) для матеріалів; за одиницю роботи — для робіт.
- НЕ повертай 0 — дай хоча б приблизну ринкову оцінку (verified: false).
- Гривні, не долари. Ціни — актуальні на ${year} рік.

Повертай ТІЛЬКИ JSON масив.`;

    // Завжди пробуємо Gemini з Google Search (реальні ціни з магазинів);
    // OpenAI — лише аварійний фолбек, якщо grounding недоступний.
    try {
      const grounded = await this.fetchFromGeminiGrounded(prompt, items.length);
      if (grounded.some((x) => x)) return grounded;
    } catch (e) {
      console.warn('⚠️ ZeroPriceFixer: grounded search failed —', e instanceof Error ? e.message : e);
    }
    return this.fetchFromOpenAI(prompt, items.length);
  }

  private async fetchFromOpenAI(
    prompt: string,
    expectedCount: number
  ): Promise<Array<PriceLookup | null>> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return new Array(expectedCount).fill(null);

    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Ти експерт з будівельного ціноутворення в Україні. Відповідай ТІЛЬКИ JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000,
    });

    return this.parseResponse(response.choices[0]?.message?.content || '[]', expectedCount);
  }

  /**
   * Пошук цін через Gemini з Google Search grounding —
   * модель шукає реальні сторінки магазинів і повертає джерело+дату.
   */
  private async fetchFromGeminiGrounded(
    prompt: string,
    expectedCount: number
  ): Promise<Array<PriceLookup | null>> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return new Array(expectedCount).fill(null);

    const genAI = new GoogleGenerativeAI(apiKey);
    // З grounding не можна вимагати responseMimeType=json — парсимо текст.
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: [{ googleSearch: {} }] as any,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8000,
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return this.parseResponse(text, expectedCount);
  }

  private parseResponse(
    text: string,
    expectedCount: number
  ): Array<PriceLookup | null> {
    try {
      const cleaned = (text || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      // З grounding модель може додати текст навколо JSON — витягуємо масив.
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      let parsed = JSON.parse(arrMatch ? arrMatch[0] : cleaned);

      // Handle wrapped response like { "prices": [...] } or { "items": [...] }
      if (parsed && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        for (const key of keys) {
          if (Array.isArray(parsed[key])) {
            parsed = parsed[key];
            break;
          }
        }
      }

      if (!Array.isArray(parsed)) return new Array(expectedCount).fill(null);

      return parsed.map((item: any): PriceLookup | null => {
        const price = parseFloat(item?.unitPrice ?? item?.price ?? 0);
        if (!Number.isFinite(price) || price <= 0) return null;

        const verified = item?.verified === true;
        const store = String(item?.source || '').trim();
        const date = String(item?.checkedDate || '').trim();
        const url = String(item?.url || '').trim();

        const source =
          verified && store
            ? `${store}${date ? ` (${date})` : ''}`
            : 'AI-оцінка (не підтверджено)';
        const reason = [verified ? '✅ знайдено' : '≈ оцінка', store, date, url]
          .filter(Boolean)
          .join(' · ');

        const rawConf = parseFloat(item?.confidence ?? (verified ? 0.85 : 0.5));
        const confidence = verified
          ? Math.min(Number.isFinite(rawConf) ? rawConf : 0.85, 0.9)
          : Math.min(Number.isFinite(rawConf) ? rawConf : 0.5, 0.5);

        return {
          unitPrice: Math.round(price * 100) / 100,
          confidence,
          verified,
          source,
          reason,
        };
      });
    } catch {
      console.error('ZeroPriceFixer: Failed to parse response');
      return new Array(expectedCount).fill(null);
    }
  }
}

export const zeroPriceFixer = new ZeroPriceFixer();
