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
const SYSTEM_PROMPT_ROOM = `Ти український дизайнер інтер'єру. Тобі дають ОДНУ кімнату плану з розмірами і прорізами. Класифікуй її тип і ОБОВ'ЯЗКОВО запропонуй меблювання.

Класифікації: kitchen, bedroom, bathroom, livingroom, corridor, hallway, office, diningroom, balcony, storage, other.

Класифікація ЗА НАЗВОЮ (пріоритет):
- "Кухня"/"Kitchen" → kitchen (плита, мийка, холодильник, кух.шафа, стіл)
- "Спальня"/"Bedroom" → bedroom (ліжко, шафа, тумба)
- "Ванна"/"Санвузол"/"Туалет" → bathroom (унітаз, раковина, ванна або душ)
- "Вітальня"/"Зала"/"Гостинна" → livingroom (диван, тв, журн.стіл, крісло)
- "Кабінет"/"Office" → office (стіл, крісло, полиця)
- "Їдальня" → diningroom (стіл, стільці)
- "Коридор" → corridor (нічого або тумба)
- "Передпокій" → hallway (тумба)
- Якщо назва незрозуміла ("Кімната 1") АЛЕ площа > 8 м² → класифікуй як livingroom і додай меблі вітальні.

Доступні типи меблів (у нижньому регістрі, англ): bed, sofa, armchair, table, chair, fridge, stove, oven, sink, toilet, shower, bathtub, wardrobe, tv, desk, shelf, kitchen-cabinet, washer, dishwasher, plant, rug.

Правила розташування:
- Координати в метрах, NW кут кімнати = (0,0), осі x→Схід, y→Південь.
- x≥0, y≥0, x+w ≤ roomW, y+h ≤ roomH.
- Меблі біля стін з невеликим зазором (margin 0.05-0.1м).
- Розміри реалістичні: ліжко 1.6×2.0, диван 2.2-2.4 × 0.9, плита 0.6×0.6, унітаз 0.4×0.65, ванна 1.7×0.7, холодильник 0.6×0.65.

ВАЖЛИВО:
- ДЛЯ КУХНІ → МУСИШ дати щонайменше 3 предмети: stove, sink, fridge
- ДЛЯ СПАЛЬНІ → МУСИШ дати ліжко + шафу
- ДЛЯ САНВУЗЛУ → МУСИШ дати унітаз + раковину
- ДЛЯ ВІТАЛЬНІ → МУСИШ дати диван
- Якщо щось не вміщається — зменши розмір, але НЕ повертай порожній furniture[].

Поверни ВИКЛЮЧНО валідний JSON (без markdown):
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

/**
 * Класифікація за назвою кімнати (українська/англійська). Використовується
 * як fallback коли AI не зміг визначитись.
 */
function inferClassFromName(name: string): RoomClass | null {
  const n = name.toLowerCase().trim();
  if (/кухн|kitchen/.test(n)) return "kitchen";
  if (/спальн|bedroom|спочивальн/.test(n)) return "bedroom";
  if (/ванн|санвузол|туалет|bathroom|wc/.test(n)) return "bathroom";
  if (/вітальн|зала|гостин|living\s*room|lounge/.test(n)) return "livingroom";
  if (/коридор|corridor|hall|холл/.test(n)) return "corridor";
  if (/передпок|hallway|entrance|вхід|тамбур/.test(n)) return "hallway";
  if (/кабінет|office|study|робоч/.test(n)) return "office";
  if (/їдальн|обідн|dining/.test(n)) return "diningroom";
  if (/балкон|лоджі|balcony|loggia/.test(n)) return "balcony";
  if (/комор|кладов|гардероб|storage|pantry|закром/.test(n)) return "storage";
  return null;
}

/** Шаблон базового меблювання — застосовується коли AI повернув 0 предметів. */
type Anchor =
  | "NW" | "NE" | "SW" | "SE"
  | "N-center" | "S-center" | "E-center" | "W-center"
  | "center";

interface BaselineItem {
  type: FurnitureType;
  label: string;
  w: number;
  h: number;
  anchor: Anchor;
}

const BASELINE: Record<RoomClass, BaselineItem[]> = {
  kitchen: [
    { type: "stove", label: "Плита", w: 0.6, h: 0.6, anchor: "NW" },
    { type: "sink", label: "Мийка", w: 0.6, h: 0.6, anchor: "N-center" },
    { type: "fridge", label: "Холодильник", w: 0.65, h: 0.65, anchor: "NE" },
    { type: "kitchen-cabinet", label: "Кух. шафа", w: 1.8, h: 0.5, anchor: "S-center" },
    { type: "table", label: "Стіл", w: 1.2, h: 0.8, anchor: "center" },
  ],
  bedroom: [
    { type: "bed", label: "Ліжко", w: 1.6, h: 2.0, anchor: "N-center" },
    { type: "wardrobe", label: "Шафа", w: 1.5, h: 0.6, anchor: "S-center" },
    { type: "desk", label: "Стіл", w: 1.0, h: 0.5, anchor: "W-center" },
  ],
  bathroom: [
    { type: "toilet", label: "Унітаз", w: 0.4, h: 0.65, anchor: "NW" },
    { type: "sink", label: "Раковина", w: 0.6, h: 0.45, anchor: "NE" },
    { type: "bathtub", label: "Ванна", w: 1.7, h: 0.7, anchor: "S-center" },
    { type: "shower", label: "Душ", w: 0.9, h: 0.9, anchor: "SW" },
    { type: "washer", label: "Пралка", w: 0.6, h: 0.6, anchor: "SE" },
  ],
  livingroom: [
    { type: "sofa", label: "Диван", w: 2.4, h: 0.9, anchor: "S-center" },
    { type: "tv", label: "Телевізор", w: 1.2, h: 0.2, anchor: "N-center" },
    { type: "table", label: "Журн. стіл", w: 1.0, h: 0.6, anchor: "center" },
    { type: "armchair", label: "Крісло", w: 0.9, h: 0.9, anchor: "SE" },
    { type: "shelf", label: "Полиця", w: 1.0, h: 0.4, anchor: "W-center" },
  ],
  diningroom: [
    { type: "table", label: "Стіл", w: 1.6, h: 0.9, anchor: "center" },
    { type: "chair", label: "Стілець", w: 0.45, h: 0.45, anchor: "N-center" },
    { type: "chair", label: "Стілець", w: 0.45, h: 0.45, anchor: "S-center" },
    { type: "shelf", label: "Сервант", w: 1.2, h: 0.5, anchor: "W-center" },
  ],
  office: [
    { type: "desk", label: "Стіл", w: 1.4, h: 0.7, anchor: "N-center" },
    { type: "chair", label: "Крісло", w: 0.55, h: 0.55, anchor: "center" },
    { type: "shelf", label: "Полиця", w: 1.0, h: 0.3, anchor: "S-center" },
    { type: "armchair", label: "Крісло", w: 0.9, h: 0.9, anchor: "SE" },
  ],
  corridor: [],
  hallway: [
    { type: "shelf", label: "Тумба", w: 0.6, h: 0.3, anchor: "E-center" },
  ],
  storage: [
    { type: "shelf", label: "Стелаж", w: 0.6, h: 0.3, anchor: "E-center" },
    { type: "shelf", label: "Стелаж", w: 0.6, h: 0.3, anchor: "W-center" },
  ],
  balcony: [
    { type: "chair", label: "Крісло", w: 0.5, h: 0.5, anchor: "SW" },
    { type: "plant", label: "Рослина", w: 0.4, h: 0.4, anchor: "SE" },
  ],
  other: [],
};

function placeAt(
  anchor: Anchor,
  roomW: number,
  roomH: number,
  itemW: number,
  itemH: number,
  margin = 0.05,
): { x: number; y: number } {
  switch (anchor) {
    case "NW":
      return { x: margin, y: margin };
    case "NE":
      return { x: Math.max(margin, roomW - itemW - margin), y: margin };
    case "SW":
      return { x: margin, y: Math.max(margin, roomH - itemH - margin) };
    case "SE":
      return {
        x: Math.max(margin, roomW - itemW - margin),
        y: Math.max(margin, roomH - itemH - margin),
      };
    case "N-center":
      return { x: Math.max(margin, (roomW - itemW) / 2), y: margin };
    case "S-center":
      return {
        x: Math.max(margin, (roomW - itemW) / 2),
        y: Math.max(margin, roomH - itemH - margin),
      };
    case "W-center":
      return { x: margin, y: Math.max(margin, (roomH - itemH) / 2) };
    case "E-center":
      return {
        x: Math.max(margin, roomW - itemW - margin),
        y: Math.max(margin, (roomH - itemH) / 2),
      };
    case "center":
      return {
        x: Math.max(margin, (roomW - itemW) / 2),
        y: Math.max(margin, (roomH - itemH) / 2),
      };
  }
}

function applyBaselineLayout(
  room: { id: string; w: number; h: number; name: string },
  classification: RoomClass,
): FurnishResult["furniture"] {
  const items = BASELINE[classification] ?? [];
  const out: FurnishResult["furniture"] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Скіпуємо предмет якщо не вміщається у кімнату
    if (item.w >= room.w - 0.1 || item.h >= room.h - 0.1) continue;
    const pos = placeAt(item.anchor, room.w, room.h, item.w, item.h);
    out.push({
      id: `fb-${room.id.slice(0, 4)}-${i}-${Date.now() % 100000}`,
      roomId: room.id,
      type: item.type,
      label: item.label,
      x: pos.x,
      y: pos.y,
      w: item.w,
      h: item.h,
      rotation: 0,
    });
  }
  return out;
}

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
    // Fallback: класифікуємо за назвою + baseline layout
    const inferred = inferClassFromName(room.name) ?? "other";
    if (inferred !== "other" && inferred !== "corridor") {
      const baseline = applyBaselineLayout(room, inferred);
      return { classification: inferred, furniture: baseline };
    }
    return { classification: inferred, furniture: [] };
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
    // Fallback: класифікуємо за назвою + baseline layout
    const inferred = inferClassFromName(room.name) ?? "other";
    if (inferred !== "other" && inferred !== "corridor") {
      const baseline = applyBaselineLayout(room, inferred);
      return { classification: inferred, furniture: baseline };
    }
    return { classification: inferred, furniture: [] };
  }

  const normalizedClass = String(parsed.classification ?? "").toLowerCase().trim();
  let classification: RoomClass = VALID_CLASSES.has(normalizedClass as RoomClass)
    ? (normalizedClass as RoomClass)
    : "other";
  // Якщо AI повернув "other" — пробуємо вивести клас із назви кімнати
  if (classification === "other") {
    const inferred = inferClassFromName(room.name);
    if (inferred) {
      classification = inferred;
      console.warn(
        `[ai-furnish] room "${room.name}" reclassified from "other" → "${inferred}" via name regex`,
      );
    } else if (room.w * room.h >= 8) {
      // Велика кімната з нетиповою назвою — за замовчуванням livingroom
      classification = "livingroom";
    }
  }

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

  // Baseline fallback: якщо AI повернув 0 предметів для habitable кімнати —
  // використовуємо хардкоднутий шаблон для цього класу.
  if (furniture.length === 0 && classification !== "corridor" && classification !== "other") {
    const baseline = applyBaselineLayout(room, classification);
    if (baseline.length > 0) {
      console.warn(
        `[ai-furnish] room "${room.name}" (${classification}): AI returned 0 items, applied baseline layout (${baseline.length} items)`,
      );
      return { classification, furniture: baseline };
    }
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
