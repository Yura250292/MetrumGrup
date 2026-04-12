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

export class ZeroPriceFixer {
  /**
   * Знайти всі позиції з нульовою ціною і спробувати знайти ціни
   * через альтернативну AI модель
   */
  async fix(
    sections: EstimateSection[],
    primaryModel: 'openai' | 'gemini' = 'openai',
    context?: { objectType?: string; area?: string; region?: string }
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

    for (const batch of batches) {
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
            estimateItem.priceSource = `${fallbackModel} fallback`;
            estimateItem.confidence = price.confidence;
            (estimateItem as any).priceNote = `Ціну знайдено через ${fallbackModel} (основна модель ${primaryModel} не знайшла)`;

            // Recalculate section total
            section.sectionTotal = section.items.reduce((sum, it) => sum + it.totalCost, 0);

            fixedItems.push({
              sectionTitle: item.sectionTitle,
              description: item.description,
              newPrice: price.unitPrice,
              source: `${fallbackModel} fallback`,
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
        if (item.unitPrice === 0 && item.quantity > 0 && item.description.trim().length > 0) {
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
    model: 'openai' | 'gemini',
    context?: { objectType?: string; area?: string; region?: string }
  ): Promise<Array<{ unitPrice: number; confidence: number; reason?: string } | null>> {
    const itemsList = items.map((item, i) =>
      `${i + 1}. "${item.description}" (од.: ${item.unit}, к-сть: ${item.quantity}, секція: ${item.sectionTitle})`
    ).join('\n');

    const contextStr = context
      ? `Тип об'єкта: ${context.objectType || 'будівництво'}, площа: ${context.area || 'невідомо'} м², регіон: ${context.region || 'Україна'}`
      : 'Будівельний кошторис, Україна, 2024-2025';

    const prompt = `Ти — експерт з ціноутворення будівельних матеріалів і робіт в Україні.

Контекст: ${contextStr}

Для кожної позиції нижче визнач РЕАЛІСТИЧНУ ціну за одиницю в гривнях (₴).
Ціни мають відповідати ринку України 2024-2025.

Позиції без цін:
${itemsList}

Поверни JSON масив з об'єктами для КОЖНОЇ позиції (в тому ж порядку):
[
  {
    "index": 1,
    "unitPrice": число_в_гривнях,
    "confidence": 0.0-1.0,
    "source": "звідки ціна (epicentrk, prom.ua, ринкова оцінка тощо)",
    "note": "коментар якщо потрібно"
  }
]

Правила:
- Ціна = ТІЛЬКИ за матеріал (без роботи), якщо позиція це матеріал
- Ціна = за одиницю роботи, якщо позиція це робота
- Якщо не впевнений — все одно дай найкращу оцінку з confidence < 0.5
- НЕ повертай 0 — дай хоча б приблизну ринкову оцінку
- Гривні, не долари

Повертай ТІЛЬКИ JSON масив, без додаткового тексту.`;

    if (model === 'openai') {
      return this.fetchFromOpenAI(prompt, items.length);
    } else {
      return this.fetchFromGemini(prompt, items.length);
    }
  }

  private async fetchFromOpenAI(
    prompt: string,
    expectedCount: number
  ): Promise<Array<{ unitPrice: number; confidence: number; reason?: string } | null>> {
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

  private async fetchFromGemini(
    prompt: string,
    expectedCount: number
  ): Promise<Array<{ unitPrice: number; confidence: number; reason?: string } | null>> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return new Array(expectedCount).fill(null);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return this.parseResponse(text, expectedCount);
  }

  private parseResponse(
    text: string,
    expectedCount: number
  ): Array<{ unitPrice: number; confidence: number; reason?: string } | null> {
    try {
      let parsed = JSON.parse(text);

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

      return parsed.map((item: any) => {
        const price = parseFloat(item?.unitPrice ?? item?.price ?? 0);
        if (price <= 0) return null;
        return {
          unitPrice: Math.round(price * 100) / 100,
          confidence: Math.min(parseFloat(item?.confidence ?? 0.5), 0.7), // Cap at 0.7 for fallback
          reason: item?.note || item?.source,
        };
      });
    } catch {
      console.error('ZeroPriceFixer: Failed to parse response');
      return new Array(expectedCount).fill(null);
    }
  }
}

export const zeroPriceFixer = new ZeroPriceFixer();
