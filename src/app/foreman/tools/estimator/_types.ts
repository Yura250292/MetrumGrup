import type { Room } from "@/lib/foreman/geometry";
import type { Surface, WorkType } from "@/lib/foreman/material-presets";

export type Step = "plan" | "works" | "result";

export interface FloorPlan {
  defaultCeilingHeight: number;
  rooms: Room[];
}

export interface WorksConfig {
  /** Активні види робіт на поверхні в конкретній кімнаті. */
  rooms: Record<string /* roomId */, Partial<Record<Surface, WorkType[]>>>;
  /** Розміри плитки (метри) key=`${roomId}:${surface}`. */
  tileSizes: Record<string, { w: number; h: number }>;
  /** Товщина в см key=`${roomId}:${workType}` (для штукатурки/стяжки). */
  thicknessCm: Record<string, number>;
}

export interface PricesConfig {
  /** Ціна за одиницю в ₴ key=`${roomId}:${presetId}`. 0/відсутнє → виключено з total. */
  unitPrices: Record<string, number>;
}

export interface EstimatorState {
  plan: FloorPlan;
  works: WorksConfig;
  prices: PricesConfig;
  step: Step;
}
