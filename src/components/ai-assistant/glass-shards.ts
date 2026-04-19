/**
 * Voronoi-style glass shard polygon definitions.
 * Each shard is a percentage-based polygon that, together, tiles the full rectangle.
 * Centre shards break first (lower delay), edge shards follow.
 */

export type ShardDef = {
  id: string;
  /** CSS polygon() points, e.g. "10% 0%, 25% 0%, 30% 15%" */
  clipPath: string;
  /** Centre-of-mass X (%) – used as transform-origin */
  cx: number;
  /** Centre-of-mass Y (%) – used as transform-origin */
  cy: number;
  /** Horizontal exit offset (px) */
  exitX: number;
  /** Vertical exit offset (px, positive = down) */
  exitY: number;
  /** Exit rotation (degrees) */
  exitRotate: number;
  /** Stagger delay (seconds, 0 – 0.15) */
  delay: number;
};

export const SHARDS: ShardDef[] = [
  // ── Top row ──
  {
    id: "s1",
    clipPath: "0% 0%, 22% 0%, 18% 14%, 0% 10%",
    cx: 10, cy: 6,
    exitX: -120, exitY: -60, exitRotate: -18,
    delay: 0.08,
  },
  {
    id: "s2",
    clipPath: "22% 0%, 48% 0%, 42% 8%, 35% 16%, 18% 14%",
    cx: 33, cy: 8,
    exitX: -30, exitY: -80, exitRotate: 12,
    delay: 0.04,
  },
  {
    id: "s3",
    clipPath: "48% 0%, 72% 0%, 68% 12%, 42% 8%",
    cx: 58, cy: 5,
    exitX: 40, exitY: -90, exitRotate: -15,
    delay: 0.05,
  },
  {
    id: "s4",
    clipPath: "72% 0%, 100% 0%, 100% 14%, 68% 12%",
    cx: 85, cy: 7,
    exitX: 130, exitY: -50, exitRotate: 22,
    delay: 0.09,
  },

  // ── Upper-middle row ──
  {
    id: "s5",
    clipPath: "0% 10%, 18% 14%, 15% 32%, 0% 28%",
    cx: 8, cy: 21,
    exitX: -140, exitY: 30, exitRotate: -25,
    delay: 0.06,
  },
  {
    id: "s6",
    clipPath: "18% 14%, 35% 16%, 38% 30%, 15% 32%",
    cx: 26, cy: 23,
    exitX: -60, exitY: 50, exitRotate: 8,
    delay: 0.02,
  },
  {
    id: "s7",
    clipPath: "35% 16%, 42% 8%, 68% 12%, 65% 28%, 38% 30%",
    cx: 50, cy: 19,
    exitX: 10, exitY: -40, exitRotate: -6,
    delay: 0,
  },
  {
    id: "s8",
    clipPath: "68% 12%, 100% 14%, 100% 30%, 65% 28%",
    cx: 83, cy: 21,
    exitX: 150, exitY: 20, exitRotate: 20,
    delay: 0.07,
  },

  // ── Centre row (impact zone — break first) ──
  {
    id: "s9",
    clipPath: "0% 28%, 15% 32%, 12% 52%, 0% 48%",
    cx: 7, cy: 40,
    exitX: -160, exitY: 80, exitRotate: -30,
    delay: 0.1,
  },
  {
    id: "s10",
    clipPath: "15% 32%, 38% 30%, 45% 50%, 12% 52%",
    cx: 28, cy: 41,
    exitX: -80, exitY: 120, exitRotate: 14,
    delay: 0.01,
  },
  {
    id: "s11",
    clipPath: "38% 30%, 65% 28%, 62% 48%, 45% 50%",
    cx: 52, cy: 39,
    exitX: 20, exitY: 100, exitRotate: -10,
    delay: 0,
  },
  {
    id: "s12",
    clipPath: "65% 28%, 100% 30%, 100% 50%, 62% 48%",
    cx: 82, cy: 39,
    exitX: 140, exitY: 90, exitRotate: 18,
    delay: 0.06,
  },

  // ── Lower-middle row ──
  {
    id: "s13",
    clipPath: "0% 48%, 12% 52%, 10% 74%, 0% 72%",
    cx: 6, cy: 62,
    exitX: -130, exitY: 140, exitRotate: -20,
    delay: 0.11,
  },
  {
    id: "s14",
    clipPath: "12% 52%, 45% 50%, 50% 70%, 10% 74%",
    cx: 29, cy: 62,
    exitX: -50, exitY: 180, exitRotate: 12,
    delay: 0.03,
  },
  {
    id: "s15",
    clipPath: "45% 50%, 62% 48%, 100% 50%, 100% 72%, 55% 75%, 50% 70%",
    cx: 69, cy: 61,
    exitX: 60, exitY: 160, exitRotate: -16,
    delay: 0.04,
  },

  // ── Bottom row ──
  {
    id: "s16",
    clipPath: "0% 72%, 10% 74%, 8% 100%, 0% 100%",
    cx: 5, cy: 87,
    exitX: -110, exitY: 200, exitRotate: -28,
    delay: 0.13,
  },
  {
    id: "s17",
    clipPath: "10% 74%, 50% 70%, 55% 75%, 48% 100%, 8% 100%",
    cx: 34, cy: 84,
    exitX: -20, exitY: 240, exitRotate: 8,
    delay: 0.07,
  },
  {
    id: "s18",
    clipPath: "55% 75%, 100% 72%, 100% 100%, 48% 100%",
    cx: 76, cy: 87,
    exitX: 100, exitY: 220, exitRotate: -14,
    delay: 0.1,
  },
];

/** Crack lines connecting shard boundaries (SVG line coords in %) */
export const CRACK_LINES = [
  { x1: 18, y1: 14, x2: 35, y2: 16 },
  { x1: 35, y1: 16, x2: 42, y2: 8 },
  { x1: 42, y1: 8, x2: 68, y2: 12 },
  { x1: 15, y1: 32, x2: 38, y2: 30 },
  { x1: 38, y1: 30, x2: 65, y2: 28 },
  { x1: 12, y1: 52, x2: 45, y2: 50 },
  { x1: 45, y1: 50, x2: 62, y2: 48 },
  { x1: 10, y1: 74, x2: 50, y2: 70 },
  { x1: 50, y1: 70, x2: 55, y2: 75 },
  // verticals
  { x1: 18, y1: 14, x2: 15, y2: 32 },
  { x1: 15, y1: 32, x2: 12, y2: 52 },
  { x1: 12, y1: 52, x2: 10, y2: 74 },
  { x1: 38, y1: 30, x2: 45, y2: 50 },
  { x1: 45, y1: 50, x2: 50, y2: 70 },
  { x1: 65, y1: 28, x2: 62, y2: 48 },
  { x1: 62, y1: 48, x2: 55, y2: 75 },
  { x1: 68, y1: 12, x2: 65, y2: 28 },
  // diagonals from impact point
  { x1: 50, y1: 40, x2: 22, y2: 0 },
  { x1: 50, y1: 40, x2: 72, y2: 0 },
  { x1: 50, y1: 40, x2: 0, y2: 28 },
  { x1: 50, y1: 40, x2: 100, y2: 30 },
  { x1: 50, y1: 40, x2: 8, y2: 100 },
  { x1: 50, y1: 40, x2: 100, y2: 72 },
];
