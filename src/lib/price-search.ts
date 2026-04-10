/**
 * ⚠️ HONEST NAMING NOTE (Plan 4.3)
 *
 * This file is named `price-search` but it does NOT actually search anywhere.
 * It calls Gemini with a prompt that asks the model to "find" prices in named
 * shops. The model has no real web access; the numbers it returns are LLM
 * estimates dressed up as search results, with all the hallucination risks
 * that implies.
 *
 * Use `lookupPrice()` from `@/lib/price-engine` instead — it walks the proper
 * provider chain (catalog → prozorro → scrape → llm) and caps LLM confidence
 * to make sure these "guessed" prices never override real ones.
 *
 * The thin wrapper `llm-price-estimate.ts` re-exports these functions under
 * an honest name; new code should import from there. This file is kept only
 * because two existing call sites still use it during the price-engine
 * transition (base-agent.ts dead helpers and llm-fallback provider).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface PriceSearchResult {
  material: string;
  averagePrice: number;
  sources: {
    shop: string;
    price: number;
    url: string;
    date: string;
  }[];
  confidence: number; // 0-1
}

/**
 * Шукає актуальні ціни на матеріал через Google Search
 */
export async function searchMaterialPrice(
  materialName: string,
  unit: string
): Promise<PriceSearchResult> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const prompt = `Знайди актуальні ціни на будівельний матеріал "${materialName}" (одиниця виміру: ${unit}) в українських будівельних магазинах станом на квітень 2026.

МАГАЗИНИ ДЛЯ ПОШУКУ:
- Епіцентр (epicentr.ua)
- Будмаркет (budmarket.com.ua)
- Леруа Мерлен (leroymerlin.ua)
- OBI (obi.ua)
- Розетка (rozetka.com.ua)
- Prom.ua

ІНСТРУКЦІЇ:
1. Шукай ТОЧНУ назву матеріалу або аналог
2. Якщо ти знаєш ціни з цих магазинів - використовуй їх
3. Якщо знайдено 2+ джерела → confidence 0.9
4. Якщо 1 джерело → confidence 0.6
5. Якщо не знайдено → confidence 0.0, averagePrice 0
6. Вказуй реальні URL магазинів якщо знаєш

Поверни JSON:
{
  "material": "${materialName}",
  "averagePrice": 245,
  "sources": [
    {"shop": "Епіцентр", "price": 245, "url": "https://epicentr.ua/...", "date": "2026-04-08"},
    {"shop": "Будмаркет", "price": 235, "url": "https://budmarket.com.ua/...", "date": "2026-04-08"}
  ],
  "confidence": 0.9
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const data = JSON.parse(text);
    return data;
  } catch (error) {
    console.error("Price search error:", error);
    // Fallback
    return {
      material: materialName,
      averagePrice: 0,
      sources: [],
      confidence: 0,
    };
  }
}

/**
 * Шукає актуальні ціни на роботу через Google Search
 */
export async function searchLaborCost(
  workName: string,
  unit: string
): Promise<{ laborRate: number; confidence: number }> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const prompt = `Знайди актуальні ціни на будівельну роботу "${workName}" (одиниця: ${unit}) в Україні станом на квітень 2026.

ДЖЕРЕЛА (якщо знаєш):
- Сайти будівельних бригад
- Прайс-листи будівельних компаній
- Форуми: master.ua, budport.com.ua, budmaydan.com
- Калькулятори будівельних робіт

ІНСТРУКЦІЇ:
1. Вказуй середню ринкову ціну для України
2. Враховуй регіон (Київ, обласні центри)
3. Якщо впевнений у ціні з кількох джерел → confidence 0.85
4. Якщо приблизна оцінка → confidence 0.6
5. Якщо не знаєш → confidence 0.0, laborRate 0

Поверни JSON:
{
  "workName": "${workName}",
  "laborRate": 650,
  "confidence": 0.85
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const data = JSON.parse(text);
    return { laborRate: data.laborRate, confidence: data.confidence };
  } catch (error) {
    console.error("Labor cost search error:", error);
    return { laborRate: 0, confidence: 0 };
  }
}

/**
 * Кешування цін для зменшення API calls
 */
const priceCache = new Map<string, { data: PriceSearchResult; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 години

export async function searchMaterialPriceCached(
  materialName: string,
  unit: string
): Promise<PriceSearchResult> {
  const key = `${materialName}_${unit}`;
  const cached = priceCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const result = await searchMaterialPrice(materialName, unit);
  priceCache.set(key, { data: result, timestamp: Date.now() });

  return result;
}
