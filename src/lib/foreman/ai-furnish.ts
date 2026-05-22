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
import { withAnthropicSlot } from "./anthropic-throttle";

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
const SYSTEM_PROMPT_ROOM = `Ти український дизайнер інтер'єру з 10+ роками досвіду. Створюєш ПОВНОЦІННЕ функціональне меблювання для одного приміщення. Це не простий "примітивний" список — це реалістичний план як для архітектурного проєкту.

Класифікація (за назвою кімнати, у нижньому регістрі):
- "Кухня" → kitchen (плита + мийка + холодильник + посудомийка + 2 секції кух.шафи + обідня група + декор)
- "Спальня" → bedroom (ліжко + 2 тумби з боків + шафа-купе + туалетний столик + крісло + килим + декор)
- "Ванна"/"Санвузол" → bathroom (ванна/душ + унітаз + раковина + пралка + полиця для рушників)
- "Вітальня"/"Зала" → livingroom (диван + 2 крісла + журн.стіл + ТВ + ТВ-стійка + 2 рослини + килим + книжкова полиця)
- "Кабінет"/"Office" → office (робочий стіл + крісло + книжкова полиця + тумба + декор)
- "Їдальня" → diningroom (великий стіл + 4-6 стільців + сервант + декор)
- "Коридор" → corridor (мінімум або нічого)
- "Передпокій" → hallway (шафа для одягу + полиця для взуття + дзеркало-полиця)
- Незрозуміла назва (наприклад "Кімната 1"): якщо площа > 12 м² → livingroom; 8-12 м² → bedroom; < 8 м² → other

Доступні типи (англ, нижній регістр): bed, sofa, armchair, table, chair, fridge, stove, oven, sink, toilet, shower, bathtub, wardrobe, tv, desk, shelf, kitchen-cabinet, washer, dishwasher, plant, rug.

КООРДИНАТИ:
- Метри, NW кут кімнати = (0,0), осі x→Схід, y→Південь.
- x≥0, y≥0, x+w ≤ roomW, y+h ≤ roomH, з margin 0.05-0.1м.

🚫 КРИТИЧНО — ЗОНИ ВИКЛЮЧЕННЯ (clearance) ПЕРЕД ПРОРІЗАМИ:
- Тобі дають openings: [{side, offset, width, type}]
- Для КОЖНИХ ДВЕРЕЙ обчисли заборонену зону шириною width+0.2м, глибиною 1.0м всередину кімнати від цієї стіни. ЖОДЕН ПРЕДМЕТ не може торкатися цієї зони (крім rug і plant).
- Для ВІКНА — зона 0.3м глибиною (не блокуй меблями впритул до вікна). Виняток: ліжко узголів'ям може бути біля вікна, тумба під вікном — OK якщо висота тумби < висоти підвіконня.
- Приклад: вікно side=N, offset=1.0, width=1.2 → заборонена зона y=[0..0.3], x=[1.0..2.2]. Жодного предмета з overlap.
- Приклад: двері side=S, offset=0.5, width=0.9 → заборонена зона y=[roomH-1..roomH], x=[0.3..1.6].
- Сервер ВІДКИДАТИМЕ предмети, що порушують це правило, тому уважно перевір кожен item.

РЕАЛІСТИЧНІ РОЗМІРИ (метри):
- ліжко двоспальне: 1.6×2.0, односпальне: 0.9×2.0, тумба біля ліжка: 0.4×0.4
- диван: 2.2-2.6 × 0.85, крісло: 0.8×0.9, журн.стіл: 1.0×0.6
- обідній стіл 4-місний: 1.2×0.8, 6-місний: 1.6-1.8 × 0.9, стілець: 0.45×0.45
- плита: 0.6×0.6, холодильник: 0.6×0.65, мийка: 0.6×0.55, посудомийка: 0.6×0.55
- кух.шафа (нижня): 0.6-2.0 м довжина × 0.6 м глибина
- унітаз: 0.4×0.65, раковина настінна: 0.6×0.45, ванна: 1.7×0.7, душ-кабіна: 0.9×0.9, пралка: 0.6×0.6
- шафа-купе: 1.6-2.5 × 0.6, тумба: 0.6×0.4, полиця: 0.8-1.6 × 0.3-0.4
- тв: 1.2-1.5 × 0.15, тв-стійка: 1.4-1.8 × 0.4
- килим: 1.8-2.5 × 1.5-2.0 (НЕ більший за 70% площі кімнати)
- рослина у вазоні: 0.35×0.35

ПРАВИЛА РОЗМІЩЕННЯ (як реальний дизайнер):
- ТЕХНІКА КУХНІ — у послідовності холодильник → робоча зона → мийка → плита → посудомийка, вздовж однієї стіни. L-форма теж OK.
- ЛІЖКО — узголів'ям до стіни (короткою стороною), з двох сторін тумби.
- ДИВАН — навпроти ТВ або під вікном, тумба з ТВ — на протилежній стіні.
- ОБІДНІЙ СТІЛ — центр кімнати, стільці рівномірно навколо (по 1-2 на кожну довгу сторону, по 1 на коротку).
- УНІТАЗ — у кутку, БІЛЯ стояка (зазвичай NW кут санвузла).
- ВАННА — вздовж довшої стіни.
- КИЛИМ — під дзеркальною групою (диван+крісло+стіл) або під ліжком, частково.
- РОСЛИНИ — у кутках кімнати, біля вікон.

ОБОВ'ЯЗКОВО (мінімум предметів):
- kitchen: 6+ (холодильник, мийка, плита, посудомийка, кух.шафа, стіл, +обідні стільці якщо є місце)
- livingroom: 7+ (диван, 1-2 крісла, журн.стіл, тв, тв-стійка, килим, рослина, полиця)
- bedroom: 6+ (ліжко, 2 тумби, шафа, туал.столик, крісло, килим)
- bathroom: 4+ (ванна або душ, унітаз, раковина, пралка)
- office: 4+ (стіл, крісло, полиця, тумба)
- diningroom: 5+ (стіл, 4-6 стільців, сервант)
- hallway: 2+ (шафа, полиця/тумба)

Якщо щось не вміщається — зменши розмір (мінімум 0.3×0.3), але НЕ ігноруй обов'язкові предмети. Краще дати 8 предметів зі скромними розмірами, ніж 3 ідеальних.

Поверни ВИКЛЮЧНО валідний JSON (без markdown):
{
  "classification": "<class>",
  "furniture": [
    {"type": "<type>", "label": "<укр.назва_3-15слів>", "x": <n>, "y": <n>, "w": <n>, "h": <n>, "rotation": 0|90|180|270}
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
    // L-подібна кухня: техніка вздовж N стіни, шафа вздовж W стіни
    { type: "fridge", label: "Холодильник", w: 0.65, h: 0.65, anchor: "NW" },
    { type: "kitchen-cabinet", label: "Робоча зона", w: 1.2, h: 0.6, anchor: "N-center" },
    { type: "sink", label: "Мийка", w: 0.6, h: 0.55, anchor: "NE" },
    { type: "stove", label: "Плита", w: 0.6, h: 0.6, anchor: "E-center" },
    { type: "dishwasher", label: "Посудомийка", w: 0.6, h: 0.55, anchor: "SE" },
    { type: "table", label: "Обідній стіл", w: 1.2, h: 0.9, anchor: "center" },
    { type: "kitchen-cabinet", label: "Шафа-вітрина", w: 1.6, h: 0.4, anchor: "S-center" },
    { type: "plant", label: "Рослина", w: 0.35, h: 0.35, anchor: "SW" },
  ],
  bedroom: [
    { type: "bed", label: "Двоспальне ліжко", w: 1.6, h: 2.0, anchor: "N-center" },
    { type: "shelf", label: "Тумба", w: 0.4, h: 0.4, anchor: "NW" },
    { type: "shelf", label: "Тумба", w: 0.4, h: 0.4, anchor: "NE" },
    { type: "wardrobe", label: "Шафа-купе", w: 2.0, h: 0.6, anchor: "S-center" },
    { type: "desk", label: "Туалетний столик", w: 1.0, h: 0.5, anchor: "W-center" },
    { type: "armchair", label: "Крісло", w: 0.8, h: 0.8, anchor: "SE" },
    { type: "rug", label: "Килим", w: 2.0, h: 1.6, anchor: "center" },
    { type: "plant", label: "Рослина", w: 0.35, h: 0.35, anchor: "SW" },
  ],
  bathroom: [
    { type: "bathtub", label: "Ванна", w: 1.7, h: 0.7, anchor: "N-center" },
    { type: "toilet", label: "Унітаз", w: 0.4, h: 0.65, anchor: "SW" },
    { type: "sink", label: "Раковина", w: 0.6, h: 0.45, anchor: "S-center" },
    { type: "shower", label: "Душ", w: 0.9, h: 0.9, anchor: "NE" },
    { type: "washer", label: "Пралка", w: 0.6, h: 0.6, anchor: "SE" },
    { type: "shelf", label: "Полиця", w: 0.6, h: 0.25, anchor: "W-center" },
  ],
  livingroom: [
    { type: "sofa", label: "Диван", w: 2.4, h: 0.9, anchor: "S-center" },
    { type: "tv", label: "Телевізор", w: 1.4, h: 0.2, anchor: "N-center" },
    { type: "table", label: "Журн. стіл", w: 1.0, h: 0.6, anchor: "center" },
    { type: "armchair", label: "Крісло", w: 0.9, h: 0.9, anchor: "SE" },
    { type: "armchair", label: "Крісло", w: 0.9, h: 0.9, anchor: "SW" },
    { type: "shelf", label: "ТВ-стійка", w: 1.6, h: 0.4, anchor: "N-center" },
    { type: "shelf", label: "Книжкова полиця", w: 1.0, h: 0.35, anchor: "W-center" },
    { type: "plant", label: "Велика рослина", w: 0.5, h: 0.5, anchor: "NW" },
    { type: "plant", label: "Рослина", w: 0.35, h: 0.35, anchor: "NE" },
    { type: "rug", label: "Килим", w: 2.5, h: 2.0, anchor: "center" },
  ],
  diningroom: [
    { type: "table", label: "Обідній стіл", w: 1.8, h: 1.0, anchor: "center" },
    { type: "chair", label: "Стілець", w: 0.45, h: 0.45, anchor: "N-center" },
    { type: "chair", label: "Стілець", w: 0.45, h: 0.45, anchor: "S-center" },
    { type: "chair", label: "Стілець", w: 0.45, h: 0.45, anchor: "W-center" },
    { type: "chair", label: "Стілець", w: 0.45, h: 0.45, anchor: "E-center" },
    { type: "shelf", label: "Сервант", w: 1.4, h: 0.5, anchor: "NW" },
    { type: "plant", label: "Рослина", w: 0.4, h: 0.4, anchor: "SE" },
  ],
  office: [
    { type: "desk", label: "Робочий стіл", w: 1.6, h: 0.7, anchor: "N-center" },
    { type: "chair", label: "Офісне крісло", w: 0.6, h: 0.6, anchor: "center" },
    { type: "shelf", label: "Книжкова полиця", w: 1.4, h: 0.35, anchor: "W-center" },
    { type: "armchair", label: "Крісло", w: 0.9, h: 0.9, anchor: "SE" },
    { type: "shelf", label: "Тумба", w: 0.6, h: 0.4, anchor: "NE" },
    { type: "plant", label: "Рослина", w: 0.35, h: 0.35, anchor: "SW" },
  ],
  corridor: [],
  hallway: [
    { type: "shelf", label: "Полиця для взуття", w: 0.8, h: 0.3, anchor: "E-center" },
    { type: "wardrobe", label: "Шафа", w: 0.6, h: 0.5, anchor: "W-center" },
    { type: "plant", label: "Рослина", w: 0.35, h: 0.35, anchor: "NE" },
  ],
  storage: [
    { type: "shelf", label: "Стелаж", w: 0.6, h: 0.35, anchor: "E-center" },
    { type: "shelf", label: "Стелаж", w: 0.6, h: 0.35, anchor: "W-center" },
    { type: "shelf", label: "Стелаж", w: 0.6, h: 0.35, anchor: "N-center" },
  ],
  balcony: [
    { type: "chair", label: "Крісло", w: 0.5, h: 0.5, anchor: "SW" },
    { type: "chair", label: "Крісло", w: 0.5, h: 0.5, anchor: "SE" },
    { type: "table", label: "Столик", w: 0.6, h: 0.6, anchor: "center" },
    { type: "plant", label: "Рослина", w: 0.4, h: 0.4, anchor: "NE" },
    { type: "plant", label: "Рослина", w: 0.4, h: 0.4, anchor: "NW" },
  ],
  other: [],
};

interface Rect2 {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: Rect2, b: Rect2, eps = 0.02): boolean {
  return !(
    a.x + a.w <= b.x + eps ||
    b.x + b.w <= a.x + eps ||
    a.y + a.h <= b.y + eps ||
    b.y + b.h <= a.y + eps
  );
}

/**
 * Зона "не ставити меблі" перед прорізом — perpendicular into the room.
 * Двері: 1 м (з невеликим відступом по ширині), вікна: 0.3 м.
 */
function openingClearanceRect(
  opening: FurnishRequest["openings"][number],
  roomW: number,
  roomH: number,
): Rect2 {
  const depth = opening.type === "door" ? 1.0 : 0.3;
  const widthMargin = opening.type === "door" ? 0.1 : 0;
  switch (opening.side) {
    case "N":
      return {
        x: Math.max(0, opening.offset - widthMargin),
        y: 0,
        w: opening.width + 2 * widthMargin,
        h: depth,
      };
    case "S":
      return {
        x: Math.max(0, opening.offset - widthMargin),
        y: Math.max(0, roomH - depth),
        w: opening.width + 2 * widthMargin,
        h: depth,
      };
    case "W":
      return {
        x: 0,
        y: Math.max(0, opening.offset - widthMargin),
        w: depth,
        h: opening.width + 2 * widthMargin,
      };
    case "E":
      return {
        x: Math.max(0, roomW - depth),
        y: Math.max(0, opening.offset - widthMargin),
        w: depth,
        h: opening.width + 2 * widthMargin,
      };
  }
}

/** Чи блокує предмет хоч один проріз цієї кімнати? */
function blocksAnyOpening(
  item: Rect2,
  openings: FurnishRequest["openings"],
  roomId: string,
  roomW: number,
  roomH: number,
): { blocked: true; opening: FurnishRequest["openings"][number] } | { blocked: false } {
  for (const o of openings) {
    if (o.roomId !== roomId) continue;
    const clearance = openingClearanceRect(o, roomW, roomH);
    if (rectsOverlap(item, clearance)) {
      return { blocked: true, opening: o };
    }
  }
  return { blocked: false };
}

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
  openings: FurnishRequest["openings"] = [],
): FurnishResult["furniture"] {
  const items = BASELINE[classification] ?? [];
  const out: FurnishResult["furniture"] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Скіпуємо предмет якщо не вміщається у кімнату
    if (item.w >= room.w - 0.1 || item.h >= room.h - 0.1) continue;
    const pos = placeAt(item.anchor, room.w, room.h, item.w, item.h);
    // Перевірка clearance прорізів (rug/plant дозволені)
    if (item.type !== "rug" && item.type !== "plant") {
      const rect: Rect2 = { x: pos.x, y: pos.y, w: item.w, h: item.h };
      const c = blocksAnyOpening(rect, openings, room.id, room.w, room.h);
      if (c.blocked) continue;
    }
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

  // 35s per-room timeout + global Anthropic semaphore + 429 retry.
  let response: Anthropic.Messages.Message;
  try {
    response = await withAnthropicSlot(() => {
      const callPromise = anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        system: SYSTEM_PROMPT_ROOM,
        messages: [{ role: "user", content: userPrompt }],
      });
      return Promise.race([
        callPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 35_000),
        ),
      ]);
    });
  } catch (e) {
    console.warn(
      `[ai-furnish] room "${room.name}" (${room.id}) call failed:`,
      e instanceof Error ? e.message : String(e),
    );
    // Fallback: класифікуємо за назвою + baseline layout
    const inferred = inferClassFromName(room.name) ?? "other";
    if (inferred !== "other" && inferred !== "corridor") {
      const baseline = applyBaselineLayout(room, inferred, openings);
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
      const baseline = applyBaselineLayout(room, inferred, openings);
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

    // Перевірка — не блокувати прорізи (двері 1м clearance / вікна 0.3м).
    // Виняток: rug (килим) і plant (рослина) можуть бути там, бо не блокують.
    if (type !== "rug" && type !== "plant") {
      const collision = blocksAnyOpening(
        { x: cx, y: cy, w: cw, h: ch },
        openings,
        room.id,
        room.w,
        room.h,
      );
      if (collision.blocked) {
        droppedCount++;
        if (droppedReasons.length < 5)
          droppedReasons.push(
            `blocks ${collision.opening.type} on ${collision.opening.side}`,
          );
        continue;
      }
    }

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
    const baseline = applyBaselineLayout(room, classification, openings);
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

  // Per-room concurrency cap. Тепер semaphore у anthropic-throttle глобально
  // обмежує паралелізм; тут можна лишити 2 (буде стояти у черзі семафора).
  const CONCURRENCY = 2;
  const results: PromiseSettledResult<RoomPromptResult>[] = new Array(
    req.rooms.length,
  );
  let cursor = 0;
  const worker = async () => {
    while (cursor < req.rooms.length) {
      const idx = cursor++;
      const room = req.rooms[idx];
      try {
        const v = await furnishRoom(anthropic, room, req.openings);
        results[idx] = { status: "fulfilled", value: v };
      } catch (e) {
        results[idx] = { status: "rejected", reason: e };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, req.rooms.length) }, worker),
  );

  const rooms: FurnishResult["rooms"] = [];
  const furniture: FurnishResult["furniture"] = [];
  for (let i = 0; i < req.rooms.length; i++) {
    const room = req.rooms[i];
    const r = results[i];
    if (r && r.status === "fulfilled") {
      rooms.push({ roomId: room.id, classification: r.value.classification });
      furniture.push(...r.value.furniture);
    } else {
      // тиха помилка — fallback на inferred class + baseline
      const inferred = inferClassFromName(room.name) ?? "other";
      if (inferred !== "other" && inferred !== "corridor") {
        const baseline = applyBaselineLayout(room, inferred, req.openings);
        rooms.push({ roomId: room.id, classification: inferred });
        furniture.push(...baseline);
      } else {
        rooms.push({ roomId: room.id, classification: inferred });
      }
    }
  }

  return { rooms, furniture };
}
