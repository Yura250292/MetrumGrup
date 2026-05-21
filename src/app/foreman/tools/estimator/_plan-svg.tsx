"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bbox, edge, freeButtons, freeSegments } from "@/lib/foreman/geometry";
import type { Room, Side } from "@/lib/foreman/geometry";
import type { FloorPlan, FurnitureItem, Opening } from "./_types";

const FURNITURE_EMOJI: Record<string, string> = {
  bed: "🛏️",
  sofa: "🛋️",
  armchair: "🪑",
  table: "🟫",
  chair: "🪑",
  fridge: "❄️",
  stove: "🔥",
  oven: "♨️",
  sink: "🚰",
  toilet: "🚽",
  shower: "🚿",
  bathtub: "🛁",
  wardrobe: "🚪",
  tv: "📺",
  desk: "🖥️",
  shelf: "📚",
  "kitchen-cabinet": "🗄️",
  washer: "🌀",
  dishwasher: "🧽",
  plant: "🪴",
  rug: "🟪",
};

const FURNITURE_FILL: Record<string, string> = {
  bed: "rgba(244,114,182,0.18)",
  sofa: "rgba(56,189,248,0.18)",
  armchair: "rgba(56,189,248,0.18)",
  table: "rgba(251,191,36,0.18)",
  chair: "rgba(251,191,36,0.14)",
  fridge: "rgba(125,211,252,0.18)",
  stove: "rgba(239,68,68,0.18)",
  oven: "rgba(239,68,68,0.15)",
  sink: "rgba(125,211,252,0.18)",
  toilet: "rgba(165,243,252,0.18)",
  shower: "rgba(125,211,252,0.18)",
  bathtub: "rgba(125,211,252,0.18)",
  wardrobe: "rgba(168,162,158,0.18)",
  tv: "rgba(99,102,241,0.18)",
  desk: "rgba(251,191,36,0.18)",
  shelf: "rgba(168,162,158,0.18)",
  "kitchen-cabinet": "rgba(168,162,158,0.18)",
  washer: "rgba(125,211,252,0.14)",
  dishwasher: "rgba(125,211,252,0.14)",
  plant: "rgba(34,197,94,0.18)",
  rug: "rgba(168,85,247,0.14)",
};

interface Props {
  plan: FloorPlan;
  onPlusClick?: (parentId: string, side: Side) => void;
  onRoomTap?: (room: Room) => void;
  /**
   * Тап по тілу кімнати у режимі «openings» — повертає визначену
   * найближчу стіну і offset у метрах від NW-кута цієї грані.
   */
  onWallTap?: (roomId: string, side: Side, offset: number) => void;
  /** Тап по меблевому предмету — для видалення/редагування. */
  onFurnitureTap?: (item: FurnitureItem) => void;
  /** Режим взаємодії з канвою. */
  viewMode?: "rooms" | "openings";
  /** Snapshot для PDF — без сітки, +, інтеракцій. */
  snapshot?: boolean;
  className?: string;
  /** Зовнішня матриця view (zoom/pan/rotate). */
  viewTransform?: { scale: number; tx: number; ty: number; rotation: number };
}

/** Розрахунок координат опеннінгу на стіні кімнати. */
function openingPoints(room: Room, o: Opening) {
  // worldSegment вздовж стіни
  switch (o.side) {
    case "N": {
      const x1 = room.x + o.offset;
      return { x1, y1: room.y, x2: x1 + o.width, y2: room.y };
    }
    case "S": {
      const x1 = room.x + o.offset;
      return { x1, y1: room.y + room.h, x2: x1 + o.width, y2: room.y + room.h };
    }
    case "E": {
      const y1 = room.y + o.offset;
      return { x1: room.x + room.w, y1, x2: room.x + room.w, y2: y1 + o.width };
    }
    case "W": {
      const y1 = room.y + o.offset;
      return { x1: room.x, y1, x2: room.x, y2: y1 + o.width };
    }
  }
}

export function PlanSvg({
  plan,
  onPlusClick,
  onRoomTap,
  onWallTap,
  onFurnitureTap,
  viewMode = "rooms",
  snapshot,
  className,
  viewTransform,
}: Props) {
  const openingsMode = viewMode === "openings" && !snapshot;
  const layout = useMemo(() => {
    const b = bbox(plan.rooms);
    const pad = Math.max(0.6, Math.max(b.w, b.h) * 0.12);
    const vb = {
      x: b.x - pad,
      y: b.y - pad,
      w: b.w + 2 * pad,
      h: b.h + 2 * pad,
    };
    const maxDim = Math.max(b.w, b.h, 1);
    const ratio = b.w === 0 || b.h === 0 ? 1 : b.w / b.h;
    const aspectClass =
      ratio > 2.2 ? "aspect-[2/1]" : ratio < 0.45 ? "aspect-[1/2]" : "aspect-[4/3]";
    return { b, vb, maxDim, aspectClass };
  }, [plan.rooms]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pxPerMeter, setPxPerMeter] = useState(60);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0 && layout.vb.w > 0) setPxPerMeter(w / layout.vb.w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.vb.w]);

  // Touch-friendly у пікселях, конвертуємо в метри.
  const baseScale = viewTransform?.scale ?? 1;
  const btnVisualR = Math.max(0.08, 12 / Math.max(pxPerMeter * baseScale, 1));
  const btnHitR = Math.max(0.18, 24 / Math.max(pxPerMeter * baseScale, 1));
  const strokePx = 1.4; // non-scaling stroke у px

  const free = useMemo(
    () => (onPlusClick && !snapshot && !openingsMode ? freeSegments(plan.rooms) : null),
    [plan.rooms, onPlusClick, snapshot, openingsMode],
  );
  const buttons = useMemo(
    () => (free ? freeButtons(plan.rooms, free) : []),
    [plan.rooms, free],
  );

  /** Конвертація client → SVG user-space, з урахуванням viewTransform. */
  const handleWallTap = (e: React.MouseEvent<SVGRectElement>, room: Room) => {
    if (!onWallTap) return;
    const target = e.currentTarget;
    const ctm = target.getScreenCTM();
    if (!ctm) return;
    const inv = ctm.inverse();
    const svgEl = target.ownerSVGElement;
    if (!svgEl) return;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(inv);
    // closest edge
    const distN = local.y - room.y;
    const distS = room.y + room.h - local.y;
    const distW = local.x - room.x;
    const distE = room.x + room.w - local.x;
    const min = Math.min(distN, distS, distW, distE);
    const side: Side =
      min === distN ? "N" : min === distS ? "S" : min === distW ? "W" : "E";
    const rawOffset =
      side === "N" || side === "S" ? local.x - room.x : local.y - room.y;
    onWallTap(room.id, side, rawOffset);
  };

  // Translation в екранних координатах застосовується ПІСЛЯ rotate/scale,
  // щоб drag вліво/вправо завжди працював вздовж екранних осей.
  const cx = layout.vb.x + layout.vb.w / 2;
  const cy = layout.vb.y + layout.vb.h / 2;
  const transformAttr = viewTransform
    ? `translate(${cx} ${cy}) translate(${viewTransform.tx} ${viewTransform.ty}) scale(${viewTransform.scale}) rotate(${viewTransform.rotation}) translate(${-cx} ${-cy})`
    : undefined;

  if (plan.rooms.length === 0) return null;

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg
        data-estimator-plan
        viewBox={`${layout.vb.x} ${layout.vb.y} ${layout.vb.w} ${layout.vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={
          className ??
          `w-full h-full touch-manipulation select-none ${layout.aspectClass}`
        }
      >
        <defs>
          {!snapshot && (
            <>
              <pattern
                id="grid-minor"
                width="0.5"
                height="0.5"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 0.5 0 L 0 0 0 0.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth={0.35}
                  vectorEffect="non-scaling-stroke"
                />
              </pattern>
              <pattern id="grid-major" width="1" height="1" patternUnits="userSpaceOnUse">
                <rect width="1" height="1" fill="url(#grid-minor)" />
                <path
                  d="M 1 0 L 0 0 0 1"
                  fill="none"
                  stroke="rgba(255,255,255,0.10)"
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                />
              </pattern>
            </>
          )}
        </defs>

        {!snapshot && (
          <rect
            x={layout.vb.x}
            y={layout.vb.y}
            width={layout.vb.w}
            height={layout.vb.h}
            fill="url(#grid-major)"
          />
        )}

        <g transform={transformAttr}>
          {plan.rooms.map((r) => {
            const showDims = Math.min(r.w, r.h) >= 1.5;
            const labelFs = Math.min(r.w, r.h) * 0.14;
            return (
              <g key={r.id}>
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  fill={openingsMode ? "rgba(251,191,36,0.08)" : "rgba(139,92,246,0.12)"}
                  stroke={openingsMode ? "rgb(251,191,36)" : "rgb(139,92,246)"}
                  strokeWidth={strokePx + 0.4}
                  strokeDasharray={openingsMode ? "0.25 0.25" : undefined}
                  vectorEffect="non-scaling-stroke"
                  rx={Math.min(0.12, Math.min(r.w, r.h) * 0.03)}
                  onClick={
                    openingsMode
                      ? (e) => handleWallTap(e, r)
                      : onRoomTap
                        ? () => onRoomTap(r)
                        : undefined
                  }
                  style={{
                    cursor: openingsMode
                      ? "crosshair"
                      : onRoomTap
                        ? "pointer"
                        : "default",
                  }}
                />
                <text
                  x={r.x + r.w / 2}
                  y={r.y + r.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#e4e4e7"
                  fontSize={labelFs}
                  fontWeight={600}
                  pointerEvents="none"
                >
                  <tspan x={r.x + r.w / 2} dy={showDims ? -labelFs * 0.4 : 0}>
                    {r.name}
                  </tspan>
                  {showDims && (
                    <tspan
                      x={r.x + r.w / 2}
                      dy={labelFs * 1.2}
                      fontSize={labelFs * 0.7}
                      fill="#a1a1aa"
                    >
                      {r.w}×{r.h} м · h {r.ceilingHeight} м
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}

          {/* openings rendered on top of walls */}
          {plan.openings.map((o) => {
            const room = plan.rooms.find((r) => r.id === o.roomId);
            if (!room) return null;
            const p = openingPoints(room, o);
            const isDoor = o.type === "door";
            // small offset to nudge the line outside the wall stroke
            return (
              <g key={o.id} pointerEvents="none">
                <line
                  x1={p.x1}
                  y1={p.y1}
                  x2={p.x2}
                  y2={p.y2}
                  stroke={isDoor ? "#fbbf24" : "#38bdf8"}
                  strokeWidth={strokePx + 2.6}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="butt"
                />
                {/* dashed accent so door/window remains readable in print */}
                {!isDoor && (
                  <line
                    x1={p.x1}
                    y1={p.y1}
                    x2={p.x2}
                    y2={p.y2}
                    stroke="#0c4a6e"
                    strokeWidth={strokePx + 0.4}
                    strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            );
          })}

          {/* Furniture overlay (worldspace = room.x + item.x) */}
          {plan.furniture.map((f) => {
            const room = plan.rooms.find((r) => r.id === f.roomId);
            if (!room) return null;
            const wx = room.x + f.x;
            const wy = room.y + f.y;
            const cx = wx + f.w / 2;
            const cy = wy + f.h / 2;
            const fill = FURNITURE_FILL[f.type] ?? "rgba(255,255,255,0.05)";
            const emoji = FURNITURE_EMOJI[f.type] ?? "▢";
            const minDim = Math.min(f.w, f.h);
            const emojiFs = Math.max(0.18, minDim * 0.55);
            const labelFs = Math.max(0.12, minDim * 0.16);
            const showLabel = minDim >= 0.6 && f.label.length > 0;
            return (
              <g
                key={f.id}
                transform={`rotate(${f.rotation} ${cx} ${cy})`}
                onClick={
                  onFurnitureTap && !snapshot ? () => onFurnitureTap(f) : undefined
                }
                style={{ cursor: onFurnitureTap ? "pointer" : "default" }}
              >
                <rect
                  x={wx}
                  y={wy}
                  width={f.w}
                  height={f.h}
                  fill={fill}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={strokePx * 0.6}
                  strokeDasharray="0.12 0.08"
                  vectorEffect="non-scaling-stroke"
                  rx={0.06}
                />
                <text
                  x={cx}
                  y={cy + emojiFs * 0.1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={emojiFs}
                  pointerEvents="none"
                >
                  {emoji}
                </text>
                {showLabel && (
                  <text
                    x={cx}
                    y={wy + f.h + labelFs * 0.9}
                    textAnchor="middle"
                    fontSize={labelFs}
                    fill="#a1a1aa"
                    pointerEvents="none"
                  >
                    {f.label}
                  </text>
                )}
              </g>
            );
          })}

          {!snapshot &&
            !openingsMode &&
            buttons.map((b) => (
              <g
                key={b.id}
                transform={`translate(${b.cx} ${b.cy})`}
                className="cursor-pointer"
                onClick={onPlusClick ? () => onPlusClick(b.parentId, b.side) : undefined}
              >
                {/* hit area — transparent, larger */}
                <circle r={btnHitR} fill="transparent" pointerEvents="all" />
                {/* outer ring */}
                <circle
                  r={btnVisualR}
                  fill="rgba(16,185,129,0.85)"
                  stroke="rgba(255,255,255,0.95)"
                  strokeWidth={strokePx}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={-btnVisualR * 0.45}
                  y1={0}
                  x2={btnVisualR * 0.45}
                  y2={0}
                  stroke="#fff"
                  strokeWidth={strokePx + 0.6}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                />
                <line
                  x1={0}
                  y1={-btnVisualR * 0.45}
                  x2={0}
                  y2={btnVisualR * 0.45}
                  stroke="#fff"
                  strokeWidth={strokePx + 0.6}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                />
              </g>
            ))}
        </g>
      </svg>
    </div>
  );
}

// re-export helper for callers that want edge coords
export { edge };
