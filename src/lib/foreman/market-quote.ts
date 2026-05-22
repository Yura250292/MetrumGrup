/**
 * Ринкові котирування для foreman-кошторису.
 *
 * Pipeline:
 *  1. Локальний довідник постачальників (SupplierMaterial, scope=firmId)
 *  2. Якщо порожньо → Gemini 3 Flash з реальним Google Search grounding,
 *     promptом обмежений до Ukrainian retail; модель повертає JSON
 *     { price, unit, source_url, source_title, source_date, confidence }.
 *  3. In-memory LRU-cache з TTL 24h щоб не довбати API на повторні запити.
 *
 * Чому Gemini Flash, а не Claude Haiku web_search: Haiku web_search повільний
 * (агентний, 5-20s/виклик) і всі виклики ділили глобальний Anthropic-семафор
 * на 3 слоти — для ~20 позицій кошторису це 5-7 хв. Gemini 3 Flash швидкий,
 * без спільного семафора, а Google Search grounding дає реальні роздрібні
 * ціни з українських магазинів.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Tool } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";

export interface MaterialQuote {
  source: "supplier" | "market" | "none";
  price: number | null;
  unit: string | null;
  sourceUrl?: string;
  sourceTitle?: string;
  /** YYYY-MM-DD або null */
  sourceDate?: string | null;
  supplierName?: string;
  /** ISO для supplier quote */
  lastSeenAt?: string;
  query?: string;
  note?: string;
}

interface CacheEntry {
  value: MaterialQuote;
  expiresAt: number;
}

const MARKET_TTL_MS = 24 * 60 * 60 * 1000;
const SUPPLIER_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

const cache = new Map<string, CacheEntry>();

function cacheKey(firmId: string | null, name: string): string {
  return `${firmId ?? "_"}|${name.toLowerCase().trim().replace(/\s+/g, " ")}`;
}

function cacheGet(key: string): MaterialQuote | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key: string, value: MaterialQuote, ttl: number): void {
  if (cache.size >= CACHE_MAX) {
    // drop oldest 50
    const keys = Array.from(cache.keys()).slice(0, 50);
    for (const k of keys) cache.delete(k);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

/** SupplierMaterial lookup по нормалізованій назві. */
async function lookupSupplier(
  firmId: string,
  name: string,
): Promise<MaterialQuote | null> {
  const nk = name.toLowerCase().trim();
  if (!nk) return null;
  // прості варіанти: точне співпадіння nameKey, contains nameKey, contains name
  const m =
    (await prisma.supplierMaterial.findFirst({
      where: { firmId, nameKey: nk, lastPrice: { not: null } },
      orderBy: [{ lastSeenAt: "desc" }],
      select: {
        name: true,
        unit: true,
        lastPrice: true,
        lastSeenAt: true,
        counterparty: { select: { name: true } },
      },
    })) ??
    (await prisma.supplierMaterial.findFirst({
      where: {
        firmId,
        lastPrice: { not: null },
        OR: [
          { nameKey: { contains: nk } },
          { name: { contains: name, mode: "insensitive" } },
        ],
      },
      orderBy: [{ lastSeenAt: "desc" }],
      select: {
        name: true,
        unit: true,
        lastPrice: true,
        lastSeenAt: true,
        counterparty: { select: { name: true } },
      },
    }));

  if (!m || m.lastPrice == null) return null;
  return {
    source: "supplier",
    price: Number(m.lastPrice),
    unit: m.unit ?? null,
    supplierName: m.counterparty?.name ?? undefined,
    lastSeenAt: m.lastSeenAt?.toISOString(),
  };
}

const MARKET_SYSTEM_PROMPT_MATERIAL = `Ти асистент із цінами на будівельні матеріали в Україні. Маєш інструмент Google Search — користуйся ним, щоб знайти поточну роздрібну ціну.

Правила:
- Шукай в українських магазинах: Епіцентр, Leroy Merlin, OBI, Нова Лінія, Rozetka, Prom.ua, будівельні інтернет-магазини.
- Дай ТИПОВУ (середню) роздрібну ціну в гривнях за вказану одиницю. Не елітний і не демпінговий сегмент.
- Якщо точного товару немає — візьми найближчий аналог тієї ж категорії.
- ВАЖЛИВО: майже завжди повертай число. Якщо пошук дав чіткі ціни — confidence 0.7-1.0. Якщо пошук неоднозначний — все одно дай свою найкращу оцінку типової ціни 2026 року в Україні і постав confidence 0.3-0.5.
- price=null лише якщо назва зовсім незрозуміла.

Поверни ВИКЛЮЧНО однорядковий JSON без markdown:
{"price": число_грн, "unit": "<одиниця>", "source_url": "<url або null>", "source_title": "<магазин/товар>", "source_date": "YYYY-MM-DD"|null, "confidence": 0.0-1.0}

Тільки JSON, без пояснень.`;

const MARKET_SYSTEM_PROMPT_LABOR = `Ти асистент із розцінками на будівельні роботи в Україні. Маєш інструмент Google Search — користуйся ним. Користувач питає вартість РОБОТИ (без матеріалу) за вид робіт, у грн за м².

Правила:
- Шукай прайси будівельних бригад/компаній, OLX послуги, калькулятори ремонту, форуми.
- Дай ТИПОВУ розцінку в Україні за 1 м² (не VIP, не екстра-дешево). Орієнтир — Київ/обласні центри.
- Якщо є діапазон — бери середину.
- ВАЖЛИВО: майже завжди повертай число. Чіткі джерела → confidence 0.7-1.0. Неоднозначно → все одно дай найкращу оцінку типової розцінки 2026 року і confidence 0.3-0.5.
- price=null лише якщо вид робіт зовсім незрозумілий.

Поверни ВИКЛЮЧНО однорядковий JSON без markdown:
{"price": число_грн_за_м², "unit": "м²", "source_url": "<url або null>", "source_title": "<коротко>", "source_date": "YYYY-MM-DD"|null, "confidence": 0.0-1.0}

Тільки JSON, без пояснень.`;

interface MarketJson {
  price?: number | null;
  unit?: string | null;
  source_url?: string;
  source_title?: string;
  source_date?: string | null;
  confidence?: number | null;
  reason?: string;
}

function friendlyErrorMessage(e: unknown): string {
  if (!(e instanceof Error)) return "Помилка пошуку";
  const m = e.message;
  // Якщо API повернув довгий JSON — обрізаємо і показуємо короткий зміст
  if (m.includes("Country code") && m.includes("not supported")) {
    return "AI-пошук тимчасово недоступний для UA. Спробуйте пізніше.";
  }
  if (m.includes("invalid_request_error")) {
    return "AI-сервіс відмовив у запиті. Введіть ціну вручну.";
  }
  if (m.includes("rate_limit") || m.includes("429")) {
    return "Забагато запитів. Спробуйте за хвилину.";
  }
  if (m.includes("timeout") || m.includes("Timeout")) {
    return "Пошук зайняв забагато часу.";
  }
  return m.length > 80 ? m.slice(0, 77) + "…" : m;
}

function extractJson(text: string): MarketJson | null {
  // strip ```json fences if present, then take the first balanced {...}
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Моделі за пріоритетом. gemini-2.5-flash — основна: у тестах стабільно
// вмикає реальний Google Search grounding (grounded:true). gemini-3-flash-preview
// — резерв: швидка, але grounding не завжди спрацьовує, тоді це оцінка з
// знань моделі (все одно повертає число — краще ніж порожньо).
const GEMINI_PRICE_MODELS = ["gemini-2.5-flash", "gemini-3-flash-preview"] as const;

// Реальний Google Search grounding. SDK 0.24 типізує лише старий
// googleSearchRetrieval (Gemini 1.5); для Gemini 2.0+/3 потрібен googleSearch —
// передаємо через каст, REST API його приймає.
const SEARCH_TOOL = [{ googleSearch: {} }] as unknown as Tool[];

let geminiClient: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  }
  return geminiClient;
}

async function lookupMarket(
  name: string,
  unit?: string,
  kind: "material" | "labor" = "material",
): Promise<MaterialQuote> {
  if (!process.env.GEMINI_API_KEY) {
    return { source: "none", price: null, unit: null, note: "GEMINI_API_KEY не налаштований" };
  }
  const systemPrompt =
    kind === "labor" ? MARKET_SYSTEM_PROMPT_LABOR : MARKET_SYSTEM_PROMPT_MATERIAL;
  const userPrompt =
    kind === "labor"
      ? `Знайди типову ринкову розцінку за м² в Україні (2026) для роботи: «${name}». Спершу пошукай у Google, потім поверни лише JSON.`
      : `Знайди типову роздрібну ціну в Україні (2026) за ${unit ?? "одиницю"} для матеріалу: «${name}». Спершу пошукай у Google, потім поверни лише JSON.`;

  const genAI = getGemini();
  let lastError: unknown = null;

  // Перебір моделей; на кожній — 1 повтор при 429/перевантаженні.
  for (const modelName of GEMINI_PRICE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          tools: SEARCH_TOOL,
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
        });
        const result = await Promise.race([
          model.generateContent(userPrompt),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 35_000),
          ),
        ]);
        const parsed = extractJson(result.response.text());
        if (!parsed) {
          return {
            source: "none",
            price: null,
            unit: null,
            note: "Не вдалося розпарсити відповідь",
          };
        }
        if (parsed.price == null || !Number.isFinite(parsed.price) || parsed.price <= 0) {
          return {
            source: "none",
            price: null,
            unit: null,
            note: parsed.reason ?? "Ціну не знайдено",
          };
        }
        const conf = typeof parsed.confidence === "number" ? parsed.confidence : null;
        return {
          source: "market",
          price: Number(parsed.price),
          unit: parsed.unit ?? unit ?? null,
          sourceUrl: parsed.source_url,
          sourceTitle: parsed.source_title,
          sourceDate: parsed.source_date ?? null,
          query: name,
          note: conf != null && conf < 0.55 ? "приблизна оцінка" : undefined,
        };
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (
          attempt === 0 &&
          /429|rate|quota|resource.?exhausted|503|overload|unavailable/i.test(msg)
        ) {
          await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
          continue; // повтор на тій самій моделі
        }
        break; // інша помилка — пробуємо наступну модель
      }
    }
  }

  return {
    source: "none",
    price: null,
    unit: null,
    note: friendlyErrorMessage(lastError),
  };
}

/**
 * Цитує матеріал: спершу довідник → потім ринок. Labor — одразу ринок.
 * Кешує обидва результати.
 */
export async function quoteItem(
  firmId: string | null,
  name: string,
  opts: { unit?: string; kind?: "material" | "labor" } = {},
): Promise<MaterialQuote> {
  const kind = opts.kind ?? "material";
  const key = `${kind}|${cacheKey(firmId, name)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (kind === "material" && firmId) {
    const supplier = await lookupSupplier(firmId, name);
    if (supplier && supplier.price != null) {
      cacheSet(key, supplier, SUPPLIER_TTL_MS);
      return supplier;
    }
  }

  const market = await lookupMarket(name, opts.unit, kind);
  cacheSet(
    key,
    market,
    market.source === "market" ? MARKET_TTL_MS : 60 * 60 * 1000,
  );
  return market;
}

/** Batched версія — паралельно з обмеженням concurrency. */
export async function quoteItemsBatch(
  firmId: string | null,
  items: { id: string; name: string; unit?: string; kind?: "material" | "labor" }[],
  concurrency = 3,
): Promise<Record<string, MaterialQuote>> {
  const out: Record<string, MaterialQuote> = {};
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i];
      try {
        out[item.id] = await quoteItem(firmId, item.name, {
          unit: item.unit,
          kind: item.kind,
        });
      } catch (e) {
        out[item.id] = {
          source: "none",
          price: null,
          unit: null,
          note: friendlyErrorMessage(e),
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
