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
  },
];

/** Усі пресети, що активуються вибраним worktype-ом. */
export function presetsForWorkType(wt: WorkType): MaterialPreset[] {
  return PRESETS.filter((p) => p.workType === wt);
}

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
