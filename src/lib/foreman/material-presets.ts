/**
 * Material presets and work-type taxonomy for the foreman PWA estimator
 * (/foreman/tools/estimator). Source of truth for what materials apply to
 * which surface and how to compute quantities.
 *
 * Норми витрати — типові для українських будматеріалів; foreman звіряє з
 * упаковкою конкретного бренду перед закупівлею.
 */

export type Unit = "kg" | "l" | "pcs" | "m2";

export type Surface = "floor" | "walls" | "ceiling";

export type QtyMode = "perArea" | "tile" | "drywall" | "thicknessCm";

export type WorkType =
  // floor
  | "floor-tile"
  | "floor-laminate"
  | "floor-leveling"
  | "floor-screed"
  // walls
  | "wall-tile"
  | "wall-putty"
  | "wall-plaster-gypsum"
  | "wall-plaster-cement"
  | "wall-paint"
  | "wall-primer"
  | "wall-drywall"
  // ceiling
  | "ceiling-paint"
  | "ceiling-primer"
  | "ceiling-putty";

export interface MaterialPreset {
  id: string;
  name: string;
  surface: Surface;
  workType: WorkType;
  /** Витрата на 1 м² базової поверхні (для thicknessCm — на 1 см товщини × м²). */
  consumptionPerSqm: number;
  unit: Unit;
  /** Запас % за замовчуванням. */
  reservePercent: number;
  qtyMode: QtyMode;
  /** Базова ціна ₴ за preset.unit (типова українська роздріб 2026). Fallback коли AI пошук не знайшов. */
  baselinePrice: number;
}

/** Площа однієї стандартної гіпсокартонної плити 1.2 × 2.5 м, м². */
export const DRYWALL_SHEET_M2 = 3;

/** Дефолтний розмір плитки (метри). */
export const DEFAULT_TILE_SIZE = { w: 0.6, h: 0.6 };

export const UNIT_LABELS: Record<Unit, string> = {
  kg: "кг",
  l: "л",
  pcs: "шт",
  m2: "м²",
};

export const SURFACE_LABELS: Record<Surface, string> = {
  floor: "Підлога",
  walls: "Стіни",
  ceiling: "Стеля",
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  "floor-tile": "Плитка",
  "floor-laminate": "Ламінат / паркет",
  "floor-leveling": "Нівелірмаса",
  "floor-screed": "Стяжка (на 1 см)",
  "wall-tile": "Плитка",
  "wall-putty": "Шпаклівка (старт + фініш)",
  "wall-plaster-gypsum": "Штукатурка гіпсова (на 1 см)",
  "wall-plaster-cement": "Штукатурка цементна (на 1 см)",
  "wall-paint": "Фарба",
  "wall-primer": "Ґрунтовка",
  "wall-drywall": "Гіпсокартон",
  "ceiling-paint": "Фарба",
  "ceiling-primer": "Ґрунтовка",
  "ceiling-putty": "Шпаклівка",
};

export const WORK_TYPES_BY_SURFACE: Record<Surface, WorkType[]> = {
  floor: ["floor-tile", "floor-laminate", "floor-leveling", "floor-screed"],
  walls: [
    "wall-tile",
    "wall-putty",
    "wall-plaster-gypsum",
    "wall-plaster-cement",
    "wall-paint",
    "wall-primer",
    "wall-drywall",
  ],
  ceiling: ["ceiling-paint", "ceiling-primer", "ceiling-putty"],
};

/** Чи показувати поле розміру плитки для цього виду робіт. */
export function isTileWork(wt: WorkType): boolean {
  return wt === "floor-tile" || wt === "wall-tile";
}

/** Чи потребує цей вид робіт товщину в см. */
export function isThicknessWork(wt: WorkType): boolean {
  return (
    wt === "floor-screed" ||
    wt === "wall-plaster-gypsum" ||
    wt === "wall-plaster-cement"
  );
}

// Базові ціни — типова українська роздріб 2026 (медіана: epicentr / leroymerlin /
// novabud). Це fallback коли AI пошук не зміг знайти; foreman може скоригувати
// вручну. Помітне відхилення від реальної ціни — нормально, бо різниця між
// економ / середнім / преміум сегментом може бути 3-5x.
export const PRESETS: MaterialPreset[] = [
  // === Підлога ===
  {
    id: "floor-tile",
    name: "Плитка для підлоги",
    surface: "floor",
    workType: "floor-tile",
    consumptionPerSqm: 1,
    unit: "pcs",
    reservePercent: 10,
    qtyMode: "tile",
    baselinePrice: 150, // ₴/шт за тип 60×60 (середній сегмент)
  },
  {
    id: "floor-tile-glue",
    name: "Плитковий клей (підлога)",
    surface: "floor",
    workType: "floor-tile",
    consumptionPerSqm: 4.5,
    unit: "kg",
    reservePercent: 10,
    qtyMode: "perArea",
    baselinePrice: 12, // Ceresit CM11/CM14 ≈ 240 ₴/мішок 25кг
  },
  {
    id: "floor-laminate",
    name: "Ламінат / паркет",
    surface: "floor",
    workType: "floor-laminate",
    consumptionPerSqm: 1,
    unit: "m2",
    reservePercent: 7,
    qtyMode: "perArea",
    baselinePrice: 320, // ₴/м² 8мм 32 клас
  },
  {
    id: "floor-underlay",
    name: "Підкладка під ламінат",
    surface: "floor",
    workType: "floor-laminate",
    consumptionPerSqm: 1,
    unit: "m2",
    reservePercent: 5,
    qtyMode: "perArea",
    baselinePrice: 35, // ₴/м² спінений ПЕ 3мм
  },
  {
    id: "floor-leveling",
    name: "Нівелірмаса",
    surface: "floor",
    workType: "floor-leveling",
    consumptionPerSqm: 15,
    unit: "kg",
    reservePercent: 5,
    qtyMode: "perArea",
    baselinePrice: 18, // ₴/кг (Ceresit CN-83 ≈ 450 ₴/25кг)
  },
  {
    id: "floor-screed",
    name: "Цементна стяжка",
    surface: "floor",
    workType: "floor-screed",
    consumptionPerSqm: 18,
    unit: "kg",
    reservePercent: 5,
    qtyMode: "thicknessCm",
    baselinePrice: 5, // ₴/кг (М-150 ≈ 125 ₴/25кг)
  },

  // === Стіни ===
  {
    id: "wall-tile",
    name: "Плитка для стін",
    surface: "walls",
    workType: "wall-tile",
    consumptionPerSqm: 1,
    unit: "pcs",
    reservePercent: 10,
    qtyMode: "tile",
    baselinePrice: 200, // ₴/шт стінова плитка
  },
  {
    id: "wall-tile-glue",
    name: "Плитковий клей (стіни)",
    surface: "walls",
    workType: "wall-tile",
    consumptionPerSqm: 4.5,
    unit: "kg",
    reservePercent: 10,
    qtyMode: "perArea",
    baselinePrice: 12,
  },
  {
    id: "wall-putty-start",
    name: "Шпаклівка стартова",
    surface: "walls",
    workType: "wall-putty",
    consumptionPerSqm: 1.2,
    unit: "kg",
    reservePercent: 10,
    qtyMode: "perArea",
    baselinePrice: 13, // ₴/кг (Knauf HP-Start ≈ 330 ₴/25кг)
  },
  {
    id: "wall-putty-finish",
    name: "Шпаклівка фінішна",
    surface: "walls",
    workType: "wall-putty",
    consumptionPerSqm: 1.0,
    unit: "kg",
    reservePercent: 10,
    qtyMode: "perArea",
    baselinePrice: 15, // ₴/кг (Sniezka ≈ 380 ₴/25кг)
  },
  {
    id: "wall-plaster-gypsum",
    name: "Штукатурка гіпсова",
    surface: "walls",
    workType: "wall-plaster-gypsum",
    consumptionPerSqm: 9,
    unit: "kg",
    reservePercent: 5,
    qtyMode: "thicknessCm",
    baselinePrice: 11, // ₴/кг (Knauf MP-75 ≈ 280 ₴/25кг)
  },
  {
    id: "wall-plaster-cement",
    name: "Штукатурка цементна",
    surface: "walls",
    workType: "wall-plaster-cement",
    consumptionPerSqm: 16,
    unit: "kg",
    reservePercent: 5,
    qtyMode: "thicknessCm",
    baselinePrice: 6, // ₴/кг
  },
  {
    id: "wall-paint",
    name: "Фарба водо-емульсійна",
    surface: "walls",
    workType: "wall-paint",
    consumptionPerSqm: 0.18,
    unit: "l",
    reservePercent: 5,
    qtyMode: "perArea",
    baselinePrice: 220, // ₴/л (Sniezka / Aura ≈ 220 ₴/л)
  },
  {
    id: "wall-primer",
    name: "Ґрунтовка глибокого проникнення",
    surface: "walls",
    workType: "wall-primer",
    consumptionPerSqm: 0.15,
    unit: "l",
    reservePercent: 5,
    qtyMode: "perArea",
    baselinePrice: 80, // ₴/л (Ceresit CT-17 ≈ 400 ₴/5л)
  },
  {
    id: "wall-drywall",
    name: "Гіпсокартон 1.2×2.5 м",
    surface: "walls",
    workType: "wall-drywall",
    consumptionPerSqm: 1 / DRYWALL_SHEET_M2,
    unit: "pcs",
    reservePercent: 10,
    qtyMode: "drywall",
    baselinePrice: 280, // ₴/лист 1.2×2.5 (Knauf 12.5мм)
  },

  // === Стеля ===
  {
    id: "ceiling-paint",
    name: "Фарба для стелі",
    surface: "ceiling",
    workType: "ceiling-paint",
    consumptionPerSqm: 0.18,
    unit: "l",
    reservePercent: 5,
    qtyMode: "perArea",
    baselinePrice: 220,
  },
  {
    id: "ceiling-primer",
    name: "Ґрунтовка стелі",
    surface: "ceiling",
    workType: "ceiling-primer",
    consumptionPerSqm: 0.15,
    unit: "l",
    reservePercent: 5,
    qtyMode: "perArea",
    baselinePrice: 80,
  },
  {
    id: "ceiling-putty",
    name: "Шпаклівка стелі",
    surface: "ceiling",
    workType: "ceiling-putty",
    consumptionPerSqm: 1.0,
    unit: "kg",
    reservePercent: 10,
    qtyMode: "perArea",
    baselinePrice: 15,
  },
];

/** Усі пресети, що активуються вибраним worktype-ом. */
export function presetsForWorkType(wt: WorkType): MaterialPreset[] {
  return PRESETS.filter((p) => p.workType === wt);
}

/**
 * Пресети РОБОТИ (labor) — окрема ставка ₴/м² за вид робіт.
 * Базові цифри — типові для України 2026; foreman може скорегувати або
 * автоматичну ціну підставить AI-quote (web_search). Помножується ТІЛЬКИ на
 * площу поверхні; на товщину/розмір плитки не залежить.
 */
export interface LaborPreset {
  workType: WorkType;
  surface: Surface;
  name: string;
  /** Базова ставка ₴ за м² (як стартова точка / fallback). */
  ratePerSqm: number;
  /** Назва для AI-quote запитів. */
  marketQuery: string;
}

export const LABOR_PRESETS: Record<WorkType, LaborPreset> = {
  "floor-tile": {
    workType: "floor-tile",
    surface: "floor",
    name: "Укладання плитки (підлога)",
    ratePerSqm: 400,
    marketQuery: "розцінка укладання плитки підлога ціна за м²",
  },
  "floor-laminate": {
    workType: "floor-laminate",
    surface: "floor",
    name: "Укладання ламінату",
    ratePerSqm: 170,
    marketQuery: "розцінка укладання ламінату ціна за м²",
  },
  "floor-leveling": {
    workType: "floor-leveling",
    surface: "floor",
    name: "Заливка нівелірмаси",
    ratePerSqm: 110,
    marketQuery: "розцінка заливка нівелірмаси самонівелір ціна за м²",
  },
  "floor-screed": {
    workType: "floor-screed",
    surface: "floor",
    name: "Стяжка підлоги",
    ratePerSqm: 200,
    marketQuery: "розцінка цементна стяжка підлоги ціна за м²",
  },
  "wall-tile": {
    workType: "wall-tile",
    surface: "walls",
    name: "Укладання плитки (стіни)",
    ratePerSqm: 480,
    marketQuery: "розцінка укладання плитки стіни ціна за м²",
  },
  "wall-putty": {
    workType: "wall-putty",
    surface: "walls",
    name: "Шпаклівка стін (старт+фініш)",
    ratePerSqm: 220,
    marketQuery: "розцінка шпаклівка стін старт фініш ціна за м²",
  },
  "wall-plaster-gypsum": {
    workType: "wall-plaster-gypsum",
    surface: "walls",
    name: "Гіпсова штукатурка стін",
    ratePerSqm: 170,
    marketQuery: "розцінка гіпсова штукатурка стін ціна за м²",
  },
  "wall-plaster-cement": {
    workType: "wall-plaster-cement",
    surface: "walls",
    name: "Цементна штукатурка стін",
    ratePerSqm: 250,
    marketQuery: "розцінка цементна штукатурка стін ціна за м²",
  },
  "wall-paint": {
    workType: "wall-paint",
    surface: "walls",
    name: "Фарбування стін",
    ratePerSqm: 100,
    marketQuery: "розцінка малярні роботи фарбування стін ціна за м²",
  },
  "wall-primer": {
    workType: "wall-primer",
    surface: "walls",
    name: "Ґрунтування стін",
    ratePerSqm: 40,
    marketQuery: "розцінка грунтування стін ціна за м²",
  },
  "wall-drywall": {
    workType: "wall-drywall",
    surface: "walls",
    name: "Монтаж гіпсокартону",
    ratePerSqm: 240,
    marketQuery: "розцінка монтаж гіпсокартону стіни ціна за м²",
  },
  "ceiling-paint": {
    workType: "ceiling-paint",
    surface: "ceiling",
    name: "Фарбування стелі",
    ratePerSqm: 120,
    marketQuery: "розцінка фарбування стелі ціна за м²",
  },
  "ceiling-primer": {
    workType: "ceiling-primer",
    surface: "ceiling",
    name: "Ґрунтування стелі",
    ratePerSqm: 40,
    marketQuery: "розцінка грунтування стелі ціна за м²",
  },
  "ceiling-putty": {
    workType: "ceiling-putty",
    surface: "ceiling",
    name: "Шпаклівка стелі",
    ratePerSqm: 240,
    marketQuery: "розцінка шпаклівка стелі ціна за м²",
  },
};

/** Розрахунок кількості матеріалу. */
export function calcQty(
  preset: MaterialPreset,
  baseAreaM2: number,
  opts: { tileW?: number; tileH?: number; thicknessCm?: number } = {},
): number {
  if (baseAreaM2 <= 0) return 0;
  const r = 1 + preset.reservePercent / 100;
  switch (preset.qtyMode) {
    case "tile": {
      const tileArea = (opts.tileW ?? DEFAULT_TILE_SIZE.w) * (opts.tileH ?? DEFAULT_TILE_SIZE.h);
      if (tileArea <= 0) return 0;
      return Math.ceil((baseAreaM2 * r) / tileArea);
    }
    case "drywall":
      return Math.ceil((baseAreaM2 * r) / DRYWALL_SHEET_M2);
    case "thicknessCm": {
      const t = opts.thicknessCm ?? 1;
      return baseAreaM2 * r * preset.consumptionPerSqm * t;
    }
    case "perArea":
    default:
      return baseAreaM2 * r * preset.consumptionPerSqm;
  }
}
