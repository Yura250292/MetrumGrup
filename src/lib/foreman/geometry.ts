/**
 * 2D geometry for the foreman floor-plan estimator.
 * Координати — у світових метрах, осі: x→Схід, y→Південь. Першa кімната
 * розташована з NW-кутом у (0,0).
 */

export type Side = "N" | "E" | "S" | "W";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room extends Rect {
  id: string;
  name: string;
  ceilingHeight: number;
}

/** Сегмент (axis-aligned). Якщо `axis="h"` — горизонтальний у `y`, від x1 до x2. */
export interface Segment {
  axis: "h" | "v";
  /** Координата вздовж осі, перпендикулярної до сегмента. */
  along: number;
  /** Початок сегмента вздовж його осі (менше значення). */
  start: number;
  /** Кінець сегмента вздовж його осі (більше значення). */
  end: number;
}

export const SIDES: Side[] = ["N", "E", "S", "W"];

/** Грань кімнати як сегмент у світових координатах. */
export function edge(r: Rect, side: Side): Segment {
  switch (side) {
    case "N":
      return { axis: "h", along: r.y, start: r.x, end: r.x + r.w };
    case "S":
      return { axis: "h", along: r.y + r.h, start: r.x, end: r.x + r.w };
    case "W":
      return { axis: "v", along: r.x, start: r.y, end: r.y + r.h };
    case "E":
      return { axis: "v", along: r.x + r.w, start: r.y, end: r.y + r.h };
  }
}

/** Протилежна грань (для пошуку shared). */
export function opposite(side: Side): Side {
  return side === "N" ? "S" : side === "S" ? "N" : side === "E" ? "W" : "E";
}

/**
 * Розташувати нову кімнату, приклеєну до конкретної грані батьківської.
 * `length` = довжина вздовж сусідньої стіни, `depth` = вглиб (перпендикулярно).
 * Дефолтне вирівнювання: лівий/верхній кут батьківської грані.
 */
export function placeAdjacent(
  parent: Rect,
  side: Side,
  length: number,
  depth: number,
): Rect {
  switch (side) {
    case "N":
      return { x: parent.x, y: parent.y - depth, w: length, h: depth };
    case "S":
      return { x: parent.x, y: parent.y + parent.h, w: length, h: depth };
    case "E":
      return { x: parent.x + parent.w, y: parent.y, w: depth, h: length };
    case "W":
      return { x: parent.x - depth, y: parent.y, w: depth, h: length };
  }
}

export function bbox(rooms: Room[]): Rect {
  if (rooms.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Чи перетинаються прямокутники (площа спільної області > eps). */
export function rectsOverlap(a: Rect, b: Rect, eps = 1e-6): boolean {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ix > eps && iy > eps;
}

/** Знайти першу існуючу кімнату, що перетинається з кандидатом. */
export function overlapsExisting(candidate: Rect, rooms: Room[]): Room | null {
  for (const r of rooms) {
    if (rectsOverlap(candidate, r)) return r;
  }
  return null;
}

/** Поверне підсегменти `seg`, які не покриті жодним із `subtract`. */
function subtractSegments(seg: Segment, subtract: Segment[]): Segment[] {
  // Усі subtract вже мають співпадати з seg по осі та along (їх фільтр — у freeSegments).
  const blocks = subtract
    .map((s) => ({ a: Math.max(seg.start, s.start), b: Math.min(seg.end, s.end) }))
    .filter((b) => b.b - b.a > 1e-6)
    .sort((x, y) => x.a - y.a);

  const result: Segment[] = [];
  let cursor = seg.start;
  for (const { a, b } of blocks) {
    if (a > cursor + 1e-6) {
      result.push({ axis: seg.axis, along: seg.along, start: cursor, end: a });
    }
    if (b > cursor) cursor = b;
  }
  if (seg.end > cursor + 1e-6) {
    result.push({ axis: seg.axis, along: seg.along, start: cursor, end: seg.end });
  }
  return result;
}

/**
 * Для кожної кімнати/грані повертає список вільних підсегментів.
 * Грань вважається shared, якщо протилежна грань іншої кімнати коллінеарна
 * (співпадає по along) та має перекриття довжиною > 0.
 */
export function freeSegments(
  rooms: Room[],
): Map<string, Record<Side, Segment[]>> {
  const out = new Map<string, Record<Side, Segment[]>>();
  for (const r of rooms) {
    const perSide: Record<Side, Segment[]> = { N: [], E: [], S: [], W: [] };
    for (const side of SIDES) {
      const me = edge(r, side);
      const opp = opposite(side);
      const blockers: Segment[] = [];
      for (const other of rooms) {
        if (other.id === r.id) continue;
        const theirs = edge(other, opp);
        if (theirs.axis !== me.axis) continue;
        if (Math.abs(theirs.along - me.along) > 1e-6) continue;
        blockers.push(theirs);
      }
      perSide[side] = subtractSegments(me, blockers);
    }
    out.set(r.id, perSide);
  }
  return out;
}

export interface FreeButton {
  id: string; // unique per (roomId, side, segIdx)
  parentId: string;
  side: Side;
  /** Центр кнопки у світових координатах. */
  cx: number;
  cy: number;
  /** Довжина вільного підсегмента у метрах. */
  length: number;
}

const MIN_FREE_SEGMENT_M = 0.5;

/** Розрахунок позицій "+" кнопок із результату freeSegments. */
export function freeButtons(
  rooms: Room[],
  free: Map<string, Record<Side, Segment[]>>,
): FreeButton[] {
  const buttons: FreeButton[] = [];
  for (const r of rooms) {
    const perSide = free.get(r.id);
    if (!perSide) continue;
    for (const side of SIDES) {
      const segs = perSide[side];
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const len = s.end - s.start;
        if (len < MIN_FREE_SEGMENT_M) continue;
        const mid = (s.start + s.end) / 2;
        const cx = s.axis === "h" ? mid : s.along;
        const cy = s.axis === "h" ? s.along : mid;
        buttons.push({
          id: `${r.id}:${side}:${i}`,
          parentId: r.id,
          side,
          cx,
          cy,
          length: len,
        });
      }
    }
  }
  return buttons;
}
