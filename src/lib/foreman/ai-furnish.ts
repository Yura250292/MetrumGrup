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

const SYSTEM_PROMPT = `Ти досвідчений український дизайнер інтер'єру. Тобі дають план квартири і ти:
1) Класифікуєш кожну кімнату по типу за назвою і розміром (kitchen, bedroom, bathroom, livingroom, corridor, hallway, office, diningroom, balcony, storage, other).
2) Пропонуєш реалістичну розстановку меблів і техніки у відповідності до української практики.

Правила:
- Меблі ПОВИННІ вміщатись у кімнату (x ≥ 0, y ≥ 0, x+w ≤ roomW, y+h ≤ roomH).
- НЕ перекривай прорізи (вікна/двері) меблями.
- Координати — у метрах у локальній системі кімнати (NW кут кімнати = (0,0), осі x→Схід, y→Південь).
- rotation: 0/90/180/270 градусів.
- Розмір кожного предмета має бути реалістичним (двоспальне ліжко ~1.6×2.0 м, диван ~2.2×0.9 м, плита ~0.6×0.6 м, унітаз ~0.4×0.65 м, ванна ~1.7×0.7 м, тощо).
- Меблі біля стіни розташовуй з опорою на стіну (x=0 або y=0, або x+w=roomW, або y+h=roomH).
- Для коридорів — мінімум меблів (можливо тумба біля входу).
- Класифікуй за назвою: "Кухня"→kitchen, "Спальня"→bedroom, "Ванна"/"Санвузол"→bathroom, "Вітальня"/"Зала"→livingroom, "Коридор"→corridor, "Кабінет"→office.

Доступні типи: bed, sofa, armchair, table, chair, fridge, stove, oven, sink, toilet, shower, bathtub, wardrobe, tv, desk, shelf, kitchen-cabinet, washer, dishwasher, plant, rug.

Поверни ВИКЛЮЧНО валідний JSON без markdown-обгорток, такого формату:
{
  "rooms": [{"roomId": "<id>", "classification": "<class>"}],
  "furniture": [
    {
      "id": "<unique short id>",
      "roomId": "<room id>",
      "type": "<type>",
      "label": "<коротка українська назва>",
      "x": <number>, "y": <number>, "w": <number>, "h": <number>,
      "rotation": 0|90|180|270
    }
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

export async function aiFurnish(req: FurnishRequest): Promise<FurnishResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY не налаштований на сервері");
  }
  if (req.rooms.length === 0) {
    return { rooms: [], furniture: [] };
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // компактний JSON-опис плану для меншого input
  const planJson = JSON.stringify({
    rooms: req.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      w: r.w,
      h: r.h,
      h_ceil: r.ceilingHeight,
    })),
    openings: req.openings.map((o) => ({
      roomId: o.roomId,
      side: o.side,
      offset: o.offset,
      w: o.width,
      h: o.height,
      type: o.type,
    })),
  });

  const userPrompt = `Ось план:\n${planJson}\n\nКласифікуй кімнати і запропонуй меблювання. Поверни лише JSON.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlocks = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = extractJson(textBlocks) as
    | { rooms?: { roomId: string; classification: string }[]; furniture?: unknown[] }
    | null;

  if (!parsed) {
    throw new Error("AI не повернув валідний JSON");
  }

  // Sanitize + clamp furniture в межі кімнат, виключити невалідні items.
  const roomIndex = new Map(req.rooms.map((r) => [r.id, r]));
  const rooms = (parsed.rooms ?? [])
    .filter((r) => roomIndex.has(r.roomId) && VALID_CLASSES.has(r.classification as RoomClass))
    .map((r) => ({
      roomId: r.roomId,
      classification: r.classification as RoomClass,
    }));

  const furniture: FurnishResult["furniture"] = [];
  const rawList = (parsed.furniture ?? []) as Array<Record<string, unknown>>;
  let autoIdx = 0;
  for (const item of rawList) {
    const roomId = typeof item.roomId === "string" ? item.roomId : "";
    const room = roomIndex.get(roomId);
    if (!room) continue;
    const type = String(item.type ?? "");
    if (!VALID_TYPES.has(type as FurnitureType)) continue;
    const x = Number(item.x);
    const y = Number(item.y);
    const w = Number(item.w);
    const h = Number(item.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    // clamp у межі кімнати
    const cx = Math.max(0, Math.min(x, Math.max(0, room.w - 0.1)));
    const cy = Math.max(0, Math.min(y, Math.max(0, room.h - 0.1)));
    const cw = Math.max(0.1, Math.min(w, room.w - cx));
    const ch = Math.max(0.1, Math.min(h, room.h - cy));
    const rotation = [0, 90, 180, 270].includes(Number(item.rotation))
      ? Number(item.rotation)
      : 0;
    const label = typeof item.label === "string" ? item.label : "";
    const id = typeof item.id === "string" && item.id.length > 0
      ? `f-${item.id}-${autoIdx++}`
      : `f-${roomId.slice(0, 4)}-${autoIdx++}`;
    furniture.push({
      id,
      roomId,
      type: type as FurnitureType,
      label,
      x: cx,
      y: cy,
      w: cw,
      h: ch,
      rotation,
    });
  }

  return { rooms, furniture };
}
