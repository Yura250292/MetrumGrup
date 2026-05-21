/**
 * AI меблювання плану для foreman estimator-у.
 *
 * Claude Haiku отримує опис кімнат (розміри + назва + прорізи) і:
 *  1. Класифікує кожну кімнату за типом (kitchen/bedroom/bathroom/...)
 *  2. Пропонує меблі/техніку з координатами у локальній системі кімнати
 *     (NW кут = (0,0), осі x→Схід, y→Південь).
 *
 * Координати чіткі, але foreman може видалити окремі предмети або
 * перегенерувати весь layout.
 */

import Anthropic from "@anthropic-ai/sdk";

export type RoomClass =
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "livingroom"
  | "corridor"
  | "hallway"
  | "office"
  | "diningroom"
  | "balcony"
  | "storage"
  | "other";

export type FurnitureType =
  | "bed"
  | "sofa"
  | "armchair"
  | "table"
  | "chair"
  | "fridge"
  | "stove"
  | "oven"
  | "sink"
  | "toilet"
  | "shower"
  | "bathtub"
  | "wardrobe"
  | "tv"
  | "desk"
  | "shelf"
  | "kitchen-cabinet"
  | "washer"
  | "dishwasher"
  | "plant"
  | "rug";

export interface FurnishRequest {
  rooms: {
    id: string;
    name: string;
    w: number;
    h: number;
    ceilingHeight: number;
  }[];
  openings: {
    roomId: string;
    side: "N" | "E" | "S" | "W";
    offset: number;
    width: number;
    height: number;
    type: "door" | "window";
  }[];
}

export interface FurnishResult {
  rooms: {
    roomId: string;
    classification: RoomClass;
  }[];
  furniture: {
    id: string;
    roomId: string;
    type: FurnitureType;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
  }[];
}

/**
 * System-prompt для ОДНІЄЇ кімнати — Claude класифікує тип і повертає меблі.
 * Окремий виклик на кімнату дає кращу якість і не перевищує токени.
 */
const SYSTEM_PROMPT_ROOM = `Ти український дизайнер інтер'єру. Тобі дають ОДНУ кімнату плану з розмірами і прорізами. Класифікуй її тип і запропонуй меблювання.

Класифікації: kitchen, bedroom, bathroom, livingroom, corridor, hallway, office, diningroom, balcony, storage, other.

Доступні типи меблів: bed, sofa, armchair, table, chair, fridge, stove, oven, sink, toilet, shower, bathtub, wardrobe, tv, desk, shelf, kitchen-cabinet, washer, dishwasher, plant, rug.

Правила:
- Координати в метрах, NW кут кімнати = (0,0), осі x→Схід, y→Південь.
- x≥0, y≥0, x+w ≤ roomW, y+h ≤ roomH.
- НЕ перекривай прорізи.
- Розміри реалістичні: ліжко ~1.6×2.0, диван ~2.2×0.9, плита ~0.6×0.6, унітаз ~0.4×0.65, ванна ~1.7×0.7.
- Меблі біля стін.
- Для коридорів/санвузлів — мінімум предметів.
- Класифікація за назвою: "Кухня"→kitchen, "Спальня"→bedroom, "Ванна"/"Санвузол"→bathroom, "Вітальня"→livingroom, "Коридор"→corridor.

Поверни ВИКЛЮЧНО валідний JSON:
{
  "classification": "<class>",
  "furniture": [
    {"type": "<type>", "label": "<укр.назва>", "x": <n>, "y": <n>, "w": <n>, "h": <n>, "rotation": 0|90|180|270}
  ]
}

Без пояснень. Тільки JSON.`;

function extractJson(text: string): unknown | null {
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

const VALID_TYPES = new Set<FurnitureType>([
  "bed", "sofa", "armchair", "table", "chair", "fridge", "stove", "oven",
  "sink", "toilet", "shower", "bathtub", "wardrobe", "tv", "desk", "shelf",
  "kitchen-cabinet", "washer", "dishwasher", "plant", "rug",
]);

const VALID_CLASSES = new Set<RoomClass>([
  "kitchen", "bedroom", "bathroom", "livingroom", "corridor", "hallway",
  "office", "diningroom", "balcony", "storage", "other",
]);

interface RoomPromptResult {
  classification: RoomClass;
  furniture: FurnishResult["furniture"];
}

async function furnishRoom(
  anthropic: Anthropic,
  room: FurnishRequest["rooms"][number],
  openings: FurnishRequest["openings"],
): Promise<RoomPromptResult> {
  const roomOpenings = openings.filter((o) => o.roomId === room.id);
  const roomInput = JSON.stringify({
    name: room.name,
    w: room.w,
    h: room.h,
    h_ceil: room.ceilingHeight,
    openings: roomOpenings.map((o) => ({
      side: o.side,
      offset: o.offset,
      w: o.width,
      h: o.height,
      type: o.type,
    })),
  });

  const userPrompt = `Кімната: ${roomInput}\nКласифікуй і запропонуй меблювання. Поверни лише JSON.`;

  // 30s per-room timeout, щоб одна кімната не зжерла весь budget
  let response: Anthropic.Messages.Message;
  try {
    const callPromise = anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system: SYSTEM_PROMPT_ROOM,
      messages: [{ role: "user", content: userPrompt }],
    });
    response = await Promise.race([
      callPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 35_000),
      ),
    ]);
  } catch (e) {
    console.warn(
      `[ai-furnish] room "${room.name}" (${room.id}) call failed:`,
      e instanceof Error ? e.message : String(e),
    );
    return { classification: "other", furniture: [] };
  }

  const textBlocks = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = extractJson(textBlocks) as
    | { classification?: string; furniture?: unknown[] }
    | null;

  if (!parsed) {
    console.warn(
      `[ai-furnish] room "${room.name}" (${room.id}): could not parse JSON. Raw text head:`,
      textBlocks.slice(0, 200),
    );
    return { classification: "other", furniture: [] };
  }

  const normalizedClass = String(parsed.classification ?? "").toLowerCase().trim();
  const classification = VALID_CLASSES.has(normalizedClass as RoomClass)
    ? (normalizedClass as RoomClass)
    : "other";

  const furniture: FurnishResult["furniture"] = [];
  const rawList = (parsed.furniture ?? []) as Array<Record<string, unknown>>;
  let autoIdx = 0;
  let droppedCount = 0;
  const droppedReasons: string[] = [];
  for (const item of rawList) {
    // Нормалізуємо тип: AI може повернути "Bed", "BED", "bed " тощо.
    const type = String(item.type ?? "").toLowerCase().trim();
    if (!VALID_TYPES.has(type as FurnitureType)) {
      droppedCount++;
      if (droppedReasons.length < 3) droppedReasons.push(`invalid type "${item.type}"`);
      continue;
    }
    const x = Number(item.x);
    const y = Number(item.y);
    const w = Number(item.w);
    const h = Number(item.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
      droppedCount++;
      if (droppedReasons.length < 3)
        droppedReasons.push(`bad dims (x=${item.x},y=${item.y},w=${item.w},h=${item.h})`);
      continue;
    }
    const cx = Math.max(0, Math.min(x, Math.max(0, room.w - 0.1)));
    const cy = Math.max(0, Math.min(y, Math.max(0, room.h - 0.1)));
    const cw = Math.max(0.1, Math.min(w, room.w - cx));
    const ch = Math.max(0.1, Math.min(h, room.h - cy));
    const rotation = [0, 90, 180, 270].includes(Number(item.rotation))
      ? Number(item.rotation)
      : 0;
    const label = typeof item.label === "string" ? item.label : "";
    furniture.push({
      id: `f-${room.id.slice(0, 4)}-${autoIdx++}-${Date.now() % 100000}`,
      roomId: room.id,
      type: type as FurnitureType,
      label,
      x: cx,
      y: cy,
      w: cw,
      h: ch,
      rotation,
    });
  }
  if (droppedCount > 0) {
    console.warn(
      `[ai-furnish] room ${room.id} (${room.name}): dropped ${droppedCount}/${rawList.length} items.`,
      droppedReasons,
    );
  }

  return { classification, furniture };
}

export async function aiFurnish(req: FurnishRequest): Promise<FurnishResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY не налаштований на сервері");
  }
  if (req.rooms.length === 0) {
    return { rooms: [], furniture: [] };
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Паралельно — одна Claude-сесія на кімнату. Якщо якась впаде/таймаутне,
  // повертаємо для неї порожній набір; інші продовжать працювати.
  const results = await Promise.allSettled(
    req.rooms.map((room) => furnishRoom(anthropic, room, req.openings)),
  );

  const rooms: FurnishResult["rooms"] = [];
  const furniture: FurnishResult["furniture"] = [];
  for (let i = 0; i < req.rooms.length; i++) {
    const room = req.rooms[i];
    const r = results[i];
    if (r.status === "fulfilled") {
      rooms.push({ roomId: room.id, classification: r.value.classification });
      furniture.push(...r.value.furniture);
    } else {
      // тиха помилка — fallback на "other" без меблів
      rooms.push({ roomId: room.id, classification: "other" });
    }
  }

  return { rooms, furniture };
}
