/**
 * Ринкові котирування для foreman-кошторису.
 *
 * Pipeline:
 *  1. Локальний довідник постачальників (SupplierMaterial, scope=firmId)
 *  2. Якщо порожньо → Claude Haiku з нативним інструментом web_search_20250305,
 *     promptом обмежений до Ukrainian retail; модель повертає JSON
 *     { price, unit, source_url, source_title, source_date }.
 *  3. In-memory LRU-cache з TTL 24h щоб не довбати API на повторні запити.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { withAnthropicSlot } from "./anthropic-throttle";

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

const MARKET_SYSTEM_PROMPT_MATERIAL = `Ти експерт по будівельних матеріалах в Україні. Користувач питає поточну роздрібну ціну на матеріал.

Правила:
- Шукай тільки на українських сайтах (epicentr.com.ua, leroymerlin.ua, novabud.com.ua, prom.ua, allo.ua, foxtrot.ua тощо).
- Бери НАЙСВІЖІШУ дату (не старішу за 6 місяців від сьогодні).
- Ціна — у гривнях за фактичну одиницю товару (шт/кг/л/м²/мішок).
- Якщо знайдено кілька — обери середню/типову ціну в Україні (не елітну, не дамповану).
- Дата перевіряється: якщо на сторінці нема дати — використай дату публікації товару або не пиши дату.

Поверни ВИКЛЮЧНО однорядковий JSON без markdown-обгорток, такого формату:
{"price": число_грн_або_null, "unit": "<одиниця>", "source_url": "<url>", "source_title": "<коротка назва сайту/товару>", "source_date": "YYYY-MM-DD"|null}

Якщо не вдалося знайти достовірну ціну → {"price": null, "reason": "<коротко чому>"}

Без пояснень. Тільки JSON.`;

const MARKET_SYSTEM_PROMPT_LABOR = `Ти експерт по будівельних роботах в Україні. Користувач питає поточну ринкову розцінку (вартість роботи без матеріалу) за вид робіт у грн за м².

Правила:
- Шукай тільки на українських сайтах (prom.ua, novabud.com.ua, remontnik.ua, profilan.com.ua, biz.liga.net, прайс-листи будівельних компаній, OLX послуги, тощо).
- Бери НАЙСВІЖІШУ дату (не старішу за 6 місяців від сьогодні).
- Ціна = типова РОЗЦІНКА в Україні за 1 м² (не VIP-сегмент, не екстра-дешеві).
- Якщо є діапазон — бери середину.

Поверни ВИКЛЮЧНО однорядковий JSON без markdown-обгорток:
{"price": число_грн_за_м²_або_null, "unit": "м²", "source_url": "<url>", "source_title": "<коротко>", "source_date": "YYYY-MM-DD"|null}

Якщо не знайдено → {"price": null, "reason": "<коротко>"}

Без пояснень. Тільки JSON.`;

interface MarketJson {
  price?: number | null;
  unit?: string | null;
  source_url?: string;
  source_title?: string;
  source_date?: string | null;
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

async function lookupMarket(
  name: string,
  unit?: string,
  kind: "material" | "labor" = "material",
): Promise<MaterialQuote> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { source: "none", price: null, unit: null, note: "ANTHROPIC_API_KEY не налаштований" };
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userPrompt =
    kind === "labor"
      ? `Знайди поточну ринкову розцінку за м² в Україні для роботи: «${name}». Поверни лише JSON.`
      : `Знайди поточну роздрібну ціну в Україні за ${unit ?? "одиницю"} для матеріалу: «${name}». Поверни лише JSON.`;

  let response: Anthropic.Messages.Message;
  try {
    // Per-call timeout 50s + global Anthropic semaphore + 429 retry.
    response = await withAnthropicSlot(() => {
      const callPromise = anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: kind === "labor" ? MARKET_SYSTEM_PROMPT_LABOR : MARKET_SYSTEM_PROMPT_MATERIAL,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
          } as unknown as Anthropic.Messages.Tool,
        ],
        messages: [{ role: "user", content: userPrompt }],
      });
      return Promise.race([
        callPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 50_000),
        ),
      ]);
    });
  } catch (e) {
    return {
      source: "none",
      price: null,
      unit: null,
      note: friendlyErrorMessage(e),
    };
  }

  // collect text blocks
  const finalText = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = extractJson(finalText);
  if (!parsed) {
    return { source: "none", price: null, unit: null, note: "Не вдалося розпарсити відповідь" };
  }
  if (parsed.price == null || !Number.isFinite(parsed.price) || parsed.price <= 0) {
    return {
      source: "none",
      price: null,
      unit: null,
      note: parsed.reason ?? "Ціну не знайдено",
    };
  }

  return {
    source: "market",
    price: Number(parsed.price),
    unit: parsed.unit ?? unit ?? null,
    sourceUrl: parsed.source_url,
    sourceTitle: parsed.source_title,
    sourceDate: parsed.source_date ?? null,
    query: name,
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
