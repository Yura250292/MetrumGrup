import type { Room, Side } from "@/lib/foreman/geometry";
import type { Surface, WorkType } from "@/lib/foreman/material-presets";

export type Step = "plan" | "works" | "result" | "visualize";

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

export interface FurnitureItem {
  id: string;
  roomId: string;
  type: FurnitureType;
  label: string;
  /** Координати NW-кута предмета у локальних координатах кімнати (метри від NW кута кімнати). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Поворот в градусах (0/90/180/270). */
  rotation: number;
}

export interface FloorPlan {
  defaultCeilingHeight: number;
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureItem[];
  /** AI-класифікація кімнат (roomId → class). */
  roomClasses: Record<string, RoomClass>;
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
