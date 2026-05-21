import type { Room, Side } from "@/lib/foreman/geometry";
import type { Surface, WorkType } from "@/lib/foreman/material-presets";

export type Step = "plan" | "works" | "result";

export type OpeningType = "door" | "window";

export interface Opening {
  id: string;
  roomId: string;
  side: Side;
  type: OpeningType;
  /** Зсув від NW-кута батьківської грані вздовж її осі, м. */
  offset: number;
  /** Ширина прорізу вздовж стіни, м. */
  width: number;
  /** Висота прорізу, м. */
  height: number;
}

export interface FloorPlan {
  defaultCeilingHeight: number;
  rooms: Room[];
  openings: Opening[];
}

export interface WorksConfig {
  rooms: Record<string /* roomId */, Partial<Record<Surface, WorkType[]>>>;
  tileSizes: Record<string, { w: number; h: number }>;
  thicknessCm: Record<string, number>;
}

export interface PricesConfig {
  unitPrices: Record<string, number>;
}

export interface EstimatorState {
  plan: FloorPlan;
  works: WorksConfig;
  prices: PricesConfig;
  step: Step;
}
