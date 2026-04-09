/**
 * Reserve / waste factors used by the quantity engine.
 *
 * These are conservative industry midpoints. They are deliberately kept in
 * one file so that future regional / object-class modifiers can be layered
 * on top without touching individual rule files.
 */

export const WASTE = {
  // Finishing
  tile: 1.07,            // +7% on cuts and breakage
  laminate: 1.10,        // +10%
  paint: 1.05,           // +5%
  spackle: 1.05,         // +5%
  primer: 1.05,
  // Walls
  gasblock: 1.05,        // +5% on cuts
  brick: 1.05,
  glue: 1.10,            // mortar/adhesive +10%
  insulation: 1.10,
  // Foundation
  concrete: 1.04,        // +4% on form leakage
  rebar: 1.13,           // +13% on cuts/laps
  formwork: 1.10,
  // Electrical
  cable: 1.15,           // +15% on routing slack
  // Plumbing
  pipe: 1.15,            // +15% on fittings/cuts
} as const;

/** Cable length per outlet/switch/light point, in metres. */
export const CABLE_LENGTH = {
  perOutlet: 8,
  perSwitch: 6,
  perLightPoint: 7,
} as const;

/** Lighting load — Watts per square metre (LED, modern). */
export const LIGHTING_LOAD_W_PER_M2 = 12;

/** Plumbing route length per square metre, in metres of pipe. */
export const PLUMBING_ROUTE_M_PER_M2 = {
  water: 0.05,           // very rough; refined when waterPoints is known
  sewer: 0.04,
} as const;

/** Tile-laying consumables. */
export const TILE_CONSUMPTION = {
  glueKgPerM2: 5,
  groutKgPerM2: 0.5,
} as const;

/** Plaster / spackle consumption (per mm of thickness). */
export const PLASTER_KG_PER_M2_PER_MM = 1.8;
export const PAINT_L_PER_M2_PER_COAT = 0.15;
export const DEFAULT_PAINT_COATS = 2;

/** Gasblock per m² of wall (200mm-thick, 600x300x200 block ≈ 0.18 m²). */
export const GASBLOCK_PIECES_PER_M2 = 5.5;
export const GASBLOCK_GLUE_KG_PER_M2 = 1.5;

/** Reinforcement per m³ of concrete, in kilograms. */
export const REBAR_KG_PER_M3 = {
  strip: 80,
  slab: 150,
  pile: 100,
  combined: 120,
} as const;
