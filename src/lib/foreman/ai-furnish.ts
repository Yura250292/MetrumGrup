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
    /** World координати NW-кута — потрібні для projectOpeningToRoom щоб
     *  знайти спільні стіни між кімнатами. */
    x: number;
    y: number;
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
  /** Опційний ID стильового сценарію. Якщо не задано — рандомний. */
  scenarioId?: string;
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
  /** Сценарій, який було використано — клієнт показує користувачеві. */
  scenario: { id: string; name: string };
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

Доступні типи (англ, нижній регістр): bed, sofa, armchair, table, chair, fridge, stove, oven, sink, toilet, shower, bathtub, wardrobe, tv, desk, shelf, kitchen-cabinet, washer, dishwasher.

❌ НЕ ДОДАВАЙ декор: жодних килимів (rug) і рослин/вазонів (plant). Лише
функціональні меблі та техніка — декор відволікає 3D-візуалізацію.

КООРДИНАТИ:
- Метри, NW кут кімнати = (0,0), осі x→Схід, y→Південь.
- x≥0, y≥0, x+w ≤ roomW, y+h ≤ roomH, з margin 0.05-0.1м.
- w і h — розміри предмета ЯК ВІН ЛЕЖИТЬ на плані: w уздовж осі X (схід-захід),
  h уздовж осі Y (північ-південь). Диван/ліжко вздовж горизонтальної (північної/
  південної) стіни → w > h. Вздовж вертикальної (західної/східної) → h > w.

ОРІЄНТАЦІЯ (rotation) — ЗАПОВНЮЙ ОБОВ'ЯЗКОВО І ПРАВИЛЬНО:
- rotation — куди дивиться ЛИЦЬОВА сторона предмета (поворот за годинниковою).
- 0 = лице вниз (південь), спинка/задник угорі. 90 = лице вліво (захід).
  180 = лице вгору (північ). 270 = лице вправо (схід).
- Предмет біля стіни стоїть СПИНКОЮ/задником ДО стіни, ЛИЦЕМ У КІМНАТУ:
  біля верхньої стіни → 0; біля нижньої → 180; біля лівої → 270; біля правої → 90.
- Стілець завжди повернутий ЛИЦЕМ ДО свого столу. Диван — лицем до ТВ.
- НЕ став усі предмети з rotation 0 — це найгрубіша помилка.

🚫 КРИТИЧНО — ЗОНИ ВИКЛЮЧЕННЯ (clearance) ПЕРЕД ПРОРІЗАМИ:
- Тобі дають openings: [{side, offset, width, type}]
- Для КОЖНИХ ДВЕРЕЙ обчисли заборонену зону шириною width+0.2м, глибиною 1.0м всередину кімнати від цієї стіни. ЖОДЕН ПРЕДМЕТ не може торкатися цієї зони.
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
- тв-тумба: 1.4-1.8 × 0.4

ПРАВИЛА РОЗМІЩЕННЯ — меблі утворюють ЛОГІЧНІ ФУНКЦІОНАЛЬНІ ГРУПИ, а не
хаотичний набір. Те, чим користуються разом, стоїть поруч і повернуте одне
до одного:

ВІТАЛЬНЯ (livingroom) — головна група навколо ТВ:
- ТВ — ОБОВ'ЯЗКОВО. Висить на стіні (тонкий, 1.2-1.5 × 0.15), під ним ТВ-тумба
  впритул до ТІЄЇ Ж стіни.
- ДИВАН — НАВПРОТИ ТВ (біля протилежної стіни), повернутий ЛИЦЕМ до ТВ.
  Відстань диван↔ТВ ≈ 2.5-3.5 м.
- ЖУРНАЛЬНИЙ СТІЛ — МІЖ диваном і ТВ, по центру перед диваном (≈0.4 м від
  дивана). НІКОЛИ не за спинкою дивана.
- КРІСЛА — збоку від журнального столу, повернуті ЛИЦЕМ до столу/ТВ (диван +
  крісла утворюють букву «П» навколо столика). НЕ розкидай крісла хаотично.
- Полиця/шафа — біля вільної стіни.

СПАЛЬНЯ (bedroom):
- ЛІЖКО — узголів'ям ДО стіни, по центру тієї стіни; rotation так, щоб
  узголів'я було до стіни. Тумби — впритул з обох боків узголів'я.
- ШАФА-КУПЕ — біля бічної або протилежної стіни. Комод/туал.столик — біля
  вільної стіни.

КУХНЯ (kitchen):
- Техніка В ОДИН РЯД уздовж ОДНІЄЇ стіни, впритул одна до одної:
  холодильник → кух.шафа → мийка → плита → посудомийка. L-форма по двох
  суміжних стінах теж OK. Уся техніка — лицем у кімнату.
- Обідній стіл зі стільцями — окремо у вільній зоні; стільці лицем до столу.

САНВУЗОЛ (bathroom): ванна вздовж довшої стіни; унітаз і раковина — біля стін
(унітаз у кут); пралка — у кут.
ЇДАЛЬНЯ (diningroom): стіл по центру, стільці рівномірно навколо, лицем до столу.
КАБІНЕТ (office): стіл біля стіни/вікна, крісло перед ним лицем до столу.

ЗАГАЛЬНЕ: великі меблі (диван, ліжко, шафа, техніка, ТВ-тумба) — СПИНКОЮ до
стін. Центр кімнати лишай вільним для проходу.

КІЛЬКІСТЬ предметів — ПОМІРНА і реалістична. Орієнтовні діапазони (не
перевищуй верхню межу):
- kitchen: 5-8 (холодильник, мийка, плита, посудомийка, 1-2 секції кух.шафи, обідній стіл зі стільцями)
- livingroom: 5-8 (диван, 1-2 крісла, журн.стіл, тв, тв-стійка, полиця)
- bedroom: 5-7 (двоспальне ліжко, 2 тумби, шафа-купе, комод або туал.столик)
- bathroom: 4-6 (ванна або душ, унітаз, раковина, пралка, полиця)
- office: 4-6 (стіл, крісло, 1-2 полиці, тумба)
- diningroom: 5-7 (стіл, 4-6 стільців, сервант)
- hallway: 2-4 (шафа для одягу, полиця взуття, тумба з дзеркалом)
- corridor: 0-1

🚫 БЕЗ НАКЛАДАНЬ — НАЙВАЖЛИВІШЕ ПРАВИЛО:
- Кожен предмет — окремий прямокутник. Предмети НЕ перетинаються один з одним.
- Виняток: стільці можуть стояти впритул до столу чи трохи під ним.
- Дотримуйся РЕАЛЬНИХ розмірів зі списку вище. НЕ зменшуй предмети штучно, щоб
  втиснути більше.
- Лишай прохід ≥0.6 м між групами меблів. Порожні ділянки підлоги — це НОРМА.
- Краще менше предметів, акуратно розставлених із відступами, ніж багато що
  налазять одне на одне. Сервер ВІДКИНЕ предмети, які перетинають інші.

Поверни ВИКЛЮЧНО валідний JSON (без markdown):
{
  "classification": "<class>",
  "furniture": [
    {"type": "<type>", "label": "<коротка укр. назва, 1-3 слова, напр. «Диван», «Холодильник», «Кухонна шафа»>", "x": <n>, "y": <n>, "w": <n>, "h": <n>, "rotation": 0|90|180|270}
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

// ─────────────────────────────────────────────────────────────────────
// СТИЛЬОВІ СЦЕНАРІЇ (20 варіантів)
// AI обирає меблі у вибраному стилі. На кожному "Перегенерувати"
// клієнт може передавати інший scenarioId — отримує іншу естетику.
// ─────────────────────────────────────────────────────────────────────

export interface FurnishScenario {
  id: string;
  name: string;
  description: string;
  preferences: string[];
}

export const FURNISH_SCENARIOS: FurnishScenario[] = [
  {
    id: "modern-minimalist",
    name: "Сучасний мінімалізм",
    description:
      "Clean lines, neutral palette (white, beige, charcoal), few but premium pieces, lots of empty space",
    preferences: [
      "Fewer larger statement pieces over many small ones",
      "1-2 plants per room maximum",
      "Sofa: 3-seater in beige or charcoal fabric",
      "Empty corners are fine",
    ],
  },
  {
    id: "scandinavian-cozy",
    name: "Скандинавський затишок",
    description:
      "Warm light wood (oak, birch), white walls, layered textiles, multiple small plants, hygge",
    preferences: [
      "Multiple plants in different sizes",
      "Layered rugs and throws on sofas",
      "Wooden furniture with light finish",
      "Reading nook with armchair near window",
    ],
  },
  {
    id: "industrial-loft",
    name: "Індустріальний лофт",
    description:
      "Exposed brick/concrete, black metal frames, leather, vintage Edison bulbs, raw materials",
    preferences: [
      "Leather sofa in cognac or dark brown",
      "Black metal coffee table or bookshelf",
      "Floor-standing lamp instead of overhead",
      "Few plants but tall (palms)",
    ],
  },
  {
    id: "boho-eclectic",
    name: "Богемний еклектичний",
    description:
      "Layered patterns, rattan, macrame, low furniture, many plants, terracotta and earth tones",
    preferences: [
      "Low sofa with many throw pillows",
      "Multiple layered rugs",
      "Many plants — hanging and floor",
      "Round/oval coffee table",
    ],
  },
  {
    id: "japandi",
    name: "Japandi (японсько-скандинавський)",
    description:
      "Low natural wood furniture, neutral muted palette, single-stem plants, restrained zen",
    preferences: [
      "Low platform bed close to floor",
      "Light oak wood throughout",
      "Single tall plant per room (bonsai, monstera)",
      "Minimal decor — under 5 items per room",
    ],
  },
  {
    id: "classic-ukrainian",
    name: "Класичний український",
    description:
      "Traditional warm style, embroidered textiles accents, family-friendly, sturdy wood",
    preferences: [
      "Dining table at center of living/dining area",
      "Sofa group facing TV — family viewing",
      "Solid wood wardrobes and shelves",
      "Embroidered runner on table, textile accents",
    ],
  },
  {
    id: "french-parisian",
    name: "Французький паризький",
    description:
      "Elegant, brass and gold accents, light fabrics, antique-style touches, refined",
    preferences: [
      "Velvet armchair in jewel tone",
      "Brass-framed mirror over console",
      "Crystal chandelier hint (no chandelier in plan view but suggest by lamp placement)",
      "Marble-look coffee table",
    ],
  },
  {
    id: "mid-century-modern",
    name: "Mid-century modern",
    description:
      "Teak wood, sculptural curved furniture, 60s vibe, mustard/olive/teal accents",
    preferences: [
      "Iconic curved sofa (Eames-style)",
      "Teak credenza for TV",
      "Sputnik-inspired lighting (suggested by lamp placement)",
      "Sunburst mirror on accent wall",
    ],
  },
  {
    id: "maximalist-gallery",
    name: "Максималістський gallery wall",
    description:
      "Bold colors, mixed patterns, full gallery walls, many decor items, eclectic abundance",
    preferences: [
      "Sofa in bold color (emerald, navy, terracotta)",
      "Multiple armchairs (each different style)",
      "Patterned rug",
      "Many plants and decor objects everywhere",
    ],
  },
  {
    id: "smart-tech",
    name: "Smart-tech орієнтований",
    description:
      "Sleek modern, integrated tech, gadgets visible, hidden storage, ambient lighting",
    preferences: [
      "Large smart TV as centerpiece",
      "Desk with monitor in living/office",
      "Sleek lines, gray and white",
      "Robot vacuum dock visible (small rect)",
    ],
  },
  {
    id: "family-kids",
    name: "Сімейний з дітьми",
    description:
      "Durable kid-friendly, soft edges, play zone, storage for toys, sturdy washable fabrics",
    preferences: [
      "Sectional sofa (more seats for family)",
      "Storage ottomans for toys",
      "Large rug as play area in living",
      "Round table corners or covered",
    ],
  },
  {
    id: "bachelor-pad",
    name: "Холостяцьке житло",
    description:
      "Dark tones, leather, bar cart, masculine palette, fewer textiles, focus on entertainment",
    preferences: [
      "Dark leather sofa",
      "Bar cart in living room",
      "Large TV with sound system",
      "Minimal plants — 1-2 max",
    ],
  },
  {
    id: "senior-accessible",
    name: "Для людей старшого віку",
    description:
      "Wide walking paths, firm seating, fewer items, no low tables to bump, grab support hints",
    preferences: [
      "Firmer higher chairs (easier to stand up)",
      "Single sofa, no second seating block",
      "Wider gaps between furniture",
      "No coffee table in middle (trip hazard)",
    ],
  },
  {
    id: "studio-saver",
    name: "Студія / економія простору",
    description:
      "Multi-functional furniture, vertical storage, fold-down items, compact pieces",
    preferences: [
      "Smaller compact sofa (2-seater)",
      "Tall narrow wardrobes/shelves (vertical)",
      "Drop-leaf or extendable table",
      "Bed could double as daybed",
    ],
  },
  {
    id: "luxury-upscale",
    name: "Преміум luxury",
    description:
      "Marble, gold/brass, large statement chandelier, premium fabrics, designer pieces",
    preferences: [
      "Marble-top coffee table",
      "Velvet or silk sofa in deep color",
      "Crystal/brass accents (suggest by lamp placement)",
      "Large area rug under entire seating group",
    ],
  },
  {
    id: "rustic-country",
    name: "Кантрі рустік",
    description:
      "Pine wood, woven baskets, gingham patterns, simple sturdy, country farmhouse",
    preferences: [
      "Wooden farmhouse dining table",
      "Pine bookshelves",
      "Woven baskets as storage",
      "Floral or gingham fabric on chairs",
    ],
  },
  {
    id: "mediterranean",
    name: "Середземноморський",
    description:
      "White walls, terracotta accents, blue glass, light woods, citrus plants, breezy",
    preferences: [
      "White or cream sofa",
      "Terracotta plant pots",
      "Light wood (whitewashed)",
      "Citrus tree near window if space",
    ],
  },
  {
    id: "asian-zen",
    name: "Азійський дзен",
    description:
      "Low platform furniture, sliding panel hints, simple lines, single bonsai, harmony",
    preferences: [
      "Low platform bed and sofa",
      "Low coffee table (Japanese kotatsu-style)",
      "Single bonsai or bamboo plant",
      "Very minimal decor",
    ],
  },
  {
    id: "coastal-beach",
    name: "Прибережний beach house",
    description:
      "Light blue and white, white-washed wood, woven natural fibers, breezy",
    preferences: [
      "White slipcovered sofa",
      "Woven jute rug",
      "Light blue accents (pillows)",
      "Driftwood-style coffee table",
    ],
  },
  {
    id: "cottagecore",
    name: "Cottagecore романтичний",
    description:
      "Floral patterns, vintage furniture, layered textiles, soft pastels, romantic",
    preferences: [
      "Floral pattern sofa or armchair",
      "Vintage-look round mirror",
      "Lace or floral table cloth on dining",
      "Plants in vintage pots, fresh flowers",
    ],
  },
];

export function pickScenario(id: string | undefined): FurnishScenario {
  if (id) {
    const found = FURNISH_SCENARIOS.find((s) => s.id === id);
    if (found) return found;
  }
  return FURNISH_SCENARIOS[Math.floor(Math.random() * FURNISH_SCENARIOS.length)];
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

/** Площа перетину двох прямокутників відносно меншого з них (0..1). */
function overlapFraction(a: Rect2, b: Rect2): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox <= 0 || oy <= 0) return 0;
  const minArea = Math.max(0.0001, Math.min(a.w * a.h, b.w * b.h));
  return (ox * oy) / minArea;
}

/** Типи меблів, які за дизайном стоять впритул до стіни (не по центру). */
const WALL_SNAP_TYPES: Set<FurnitureType> = new Set([
  "bed",
  "sofa",
  "armchair",
  "wardrobe",
  "fridge",
  "stove",
  "oven",
  "sink",
  "toilet",
  "bathtub",
  "shower",
  "washer",
  "dishwasher",
  "kitchen-cabinet",
  "tv",
  "desk",
  "shelf",
]);

/**
 * Зона "не ставити меблі" перед прорізом — perpendicular into the room.
 * Двері: 1.2 м (swing зона + comfortable walk-through), вікна: 0.3 м.
 */
function openingClearanceRect(
  opening: FurnishRequest["openings"][number],
  roomW: number,
  roomH: number,
): Rect2 {
  const depth = opening.type === "door" ? 1.2 : 0.3;
  const widthMargin = opening.type === "door" ? 0.15 : 0;
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

/**
 * Проектує опеннінг із sourceRoom на targetRoom, якщо вони мають спільну
 * стіну і опеннінг лежить на ній. Без цього двері/вікна між кімнатами
 * "видимі" тільки для тієї кімнати, на якій користувач їх позначив, і AI
 * не знає про них при меблюванні сусідньої кімнати.
 *
 * Повертає null якщо опеннінг НЕ на спільній стіні.
 */
function projectOpeningToRoom(
  opening: FurnishRequest["openings"][number],
  sourceRoom: FurnishRequest["rooms"][number],
  targetRoom: FurnishRequest["rooms"][number],
): FurnishRequest["openings"][number] | null {
  if (sourceRoom.id === targetRoom.id) return null;

  const EPS = 0.02;
  const sxA =
    opening.side === "N" || opening.side === "S"
      ? sourceRoom.x + opening.offset
      : sourceRoom.x + (opening.side === "E" ? sourceRoom.w : 0);
  const sxB =
    opening.side === "N" || opening.side === "S"
      ? sourceRoom.x + opening.offset + opening.width
      : sxA;
  const syA =
    opening.side === "E" || opening.side === "W"
      ? sourceRoom.y + opening.offset
      : sourceRoom.y + (opening.side === "S" ? sourceRoom.h : 0);
  const syB =
    opening.side === "E" || opening.side === "W"
      ? sourceRoom.y + opening.offset + opening.width
      : syA;

  const txMin = targetRoom.x;
  const txMax = targetRoom.x + targetRoom.w;
  const tyMin = targetRoom.y;
  const tyMax = targetRoom.y + targetRoom.h;

  const horizontal = opening.side === "N" || opening.side === "S";

  if (horizontal) {
    // Опеннінг — горизонтальна лінія в y = syA. Шукаємо чи це N або S
    // стіна targetRoom.
    const yLine = syA;
    // Має бути на одній з горизонтальних стін targetRoom і x-діапазон
    // має перекриватися з x-діапазоном targetRoom.
    const xOverlapMin = Math.max(sxA, txMin);
    const xOverlapMax = Math.min(sxB, txMax);
    if (xOverlapMax - xOverlapMin < opening.width - EPS) return null;

    if (Math.abs(yLine - tyMin) < EPS) {
      return {
        ...opening,
        roomId: targetRoom.id,
        side: "N",
        offset: Math.max(0, xOverlapMin - txMin),
      };
    }
    if (Math.abs(yLine - tyMax) < EPS) {
      return {
        ...opening,
        roomId: targetRoom.id,
        side: "S",
        offset: Math.max(0, xOverlapMin - txMin),
      };
    }
    return null;
  }

  // Vertical opening — на E/W стіні
  const xLine = sxA;
  const yOverlapMin = Math.max(syA, tyMin);
  const yOverlapMax = Math.min(syB, tyMax);
  if (yOverlapMax - yOverlapMin < opening.width - EPS) return null;

  if (Math.abs(xLine - txMin) < EPS) {
    return {
      ...opening,
      roomId: targetRoom.id,
      side: "W",
      offset: Math.max(0, yOverlapMin - tyMin),
    };
  }
  if (Math.abs(xLine - txMax) < EPS) {
    return {
      ...opening,
      roomId: targetRoom.id,
      side: "E",
      offset: Math.max(0, yOverlapMin - tyMin),
    };
  }
  return null;
}

/**
 * Розширює список опеннінгів: для кожної кімнати додає проекції з сусідніх.
 * Результат — масив де КОЖНА кімната бачить ВСІ опеннінги, що впливають на її
 * стіни, незалежно від того, де користувач їх "зареєстрував".
 */
function expandOpenings(
  rooms: FurnishRequest["rooms"],
  openings: FurnishRequest["openings"],
): FurnishRequest["openings"] {
  const result: FurnishRequest["openings"] = [...openings];
  const seenKeys = new Set(
    openings.map((o) => `${o.roomId}|${o.side}|${o.offset.toFixed(2)}|${o.width.toFixed(2)}`),
  );

  for (const targetRoom of rooms) {
    for (const o of openings) {
      if (o.roomId === targetRoom.id) continue;
      const sourceRoom = rooms.find((r) => r.id === o.roomId);
      if (!sourceRoom) continue;
      const projected = projectOpeningToRoom(o, sourceRoom, targetRoom);
      if (!projected) continue;
      const key = `${projected.roomId}|${projected.side}|${projected.offset.toFixed(2)}|${projected.width.toFixed(2)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      result.push(projected);
    }
  }
  return result;
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
    // Декор (килими, рослини) НЕ додаємо — відволікає 3D-генерацію.
    if (item.type === "rug" || item.type === "plant") continue;
    // Скіпуємо предмет якщо не вміщається у кімнату
    if (item.w >= room.w - 0.1 || item.h >= room.h - 0.1) continue;
    const pos = placeAt(item.anchor, room.w, room.h, item.w, item.h);
    // Перевірка clearance прорізів (декор уже відфільтровано вище).
    const rect: Rect2 = { x: pos.x, y: pos.y, w: item.w, h: item.h };
    if (blocksAnyOpening(rect, openings, room.id, room.w, room.h).blocked) {
      continue;
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
  scenario: FurnishScenario,
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

  const variantSeed = Math.floor(Math.random() * 100000);
  const userPrompt = `Кімната: ${roomInput}

СТИЛЬ МЕБЛЮВАННЯ: «${scenario.name}» — ${scenario.description}
Стильові preferences (обов'язково врахуй):
${scenario.preferences.map((p) => `  - ${p}`).join("\n")}

Класифікуй кімнату і запропонуй меблювання у цьому стилі. ВАЖЛИВО — навіть у одному стилі варіюй розташування меблів (не дублюй один і той самий layout). Variant seed: ${variantSeed}.

Поверни лише JSON.`;

  // 60s per-room timeout + global Anthropic semaphore + 429 retry.
  // Sonnet (а не Haiku) — просторове планування меблів (орієнтація,
  // функціональні групи) потребує сильнішої моделі; Haiku ставив усе під 0°.
  let response: Anthropic.Messages.Message;
  try {
    response = await withAnthropicSlot(() => {
      const callPromise = anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT_ROOM,
        messages: [{ role: "user", content: userPrompt }],
      });
      return Promise.race([
        callPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 60_000),
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
    // Декор (килими, рослини) НЕ додаємо — він відволікає 3D-генерацію.
    if (type === "rug" || type === "plant") continue;
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

    // Анти-хаос: відкидаємо предмет, що суттєво (>30%) перетинає вже
    // прийнятий. Виняток: rug лягає ПІД меблі; стілець ↔ стіл/desk —
    // стільці підсуваються під стіл, накладання нормальне.
    if (type !== "rug") {
      const cand: Rect2 = { x: cx, y: cy, w: cw, h: ch };
      let overlapsAccepted = false;
      for (const a of furniture) {
        if (a.type === "rug") continue;
        const chairTablePair =
          (type === "chair" && (a.type === "table" || a.type === "desk")) ||
          ((type === "table" || type === "desk") && a.type === "chair");
        if (chairTablePair) continue;
        if (overlapFraction(cand, a) > 0.22) {
          overlapsAccepted = true;
          break;
        }
      }
      if (overlapsAccepted) {
        droppedCount++;
        if (droppedReasons.length < 5) droppedReasons.push("overlaps another item");
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

  // Вирівнювання до стін: меблі, що мають стояти біля стіни, але "плавають"
  // близько до неї — підсуваємо впритул. Робить план охайнішим (менше
  // хаотичного розкидання). Снеп лише якщо нова позиція не блокує проріз і
  // не накладається на інший предмет.
  for (let i = 0; i < furniture.length; i++) {
    const f = furniture[i];
    if (!WALL_SNAP_TYPES.has(f.type)) continue;
    const dW = f.x;
    const dN = f.y;
    const dE = room.w - (f.x + f.w);
    const dS = room.h - (f.y + f.h);
    const m = Math.min(dW, dN, dE, dS);
    if (m <= 0.03 || m > 0.7) continue; // вже впритул або задалеко від стіни
    const snapped: Rect2 = { x: f.x, y: f.y, w: f.w, h: f.h };
    if (m === dW) snapped.x = 0;
    else if (m === dN) snapped.y = 0;
    else if (m === dE) snapped.x = Math.max(0, room.w - f.w);
    else snapped.y = Math.max(0, room.h - f.h);
    if (blocksAnyOpening(snapped, openings, room.id, room.w, room.h).blocked) {
      continue;
    }
    let bad = false;
    for (let j = 0; j < furniture.length; j++) {
      if (j === i || furniture[j].type === "rug") continue;
      if (overlapFraction(snapped, furniture[j]) > 0.12) {
        bad = true;
        break;
      }
    }
    if (bad) continue;
    f.x = snapped.x;
    f.y = snapped.y;
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
  const scenario = pickScenario(req.scenarioId);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY не налаштований на сервері");
  }
  if (req.rooms.length === 0) {
    return {
      rooms: [],
      furniture: [],
      scenario: { id: scenario.id, name: scenario.name },
    };
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // ВАЖЛИВО: розширюємо опеннінги — кожна кімната має бачити всі прорізи,
  // що впливають на її стіни (включно з тими, що зареєстровані на сусідніх
  // кімнатах через спільні стіни). Інакше AI ставить меблі на двері між
  // кімнатами, бо «зі свого боку» їх не бачить.
  const expandedOpenings = expandOpenings(req.rooms, req.openings);

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
        const v = await furnishRoom(anthropic, room, expandedOpenings, scenario);
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
        const baseline = applyBaselineLayout(room, inferred, expandedOpenings);
        rooms.push({ roomId: room.id, classification: inferred });
        furniture.push(...baseline);
      } else {
        rooms.push({ roomId: room.id, classification: inferred });
      }
    }
  }

  return {
    rooms,
    furniture,
    scenario: { id: scenario.id, name: scenario.name },
  };
}
