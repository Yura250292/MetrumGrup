"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bbox, edge, freeButtons, freeSegments } from "@/lib/foreman/geometry";
import type { Room, Side } from "@/lib/foreman/geometry";
import type { FloorPlan, Opening } from "./_types";

interface Props {
  plan: FloorPlan;
  onPlusClick?: (parentId: string, side: Side) => void;
  onRoomTap?: (room: Room) => void;
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
  snapshot,
  className,
  viewTransform,
}: Props) {
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
    () => (onPlusClick && !snapshot ? freeSegments(plan.rooms) : null),
    [plan.rooms, onPlusClick, snapshot],
  );
  const buttons = useMemo(
    () => (onPlusClick && free && !snapshot ? freeButtons(plan.rooms, free) : []),
    [plan.rooms, free, onPlusClick, snapshot],
  );

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
              <g
                key={r.id}
                onClick={onRoomTap ? () => onRoomTap(r) : undefined}
                className={onRoomTap ? "cursor-pointer" : undefined}
              >
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  fill="rgba(139,92,246,0.12)"
                  stroke="rgb(139,92,246)"
                  strokeWidth={strokePx + 0.4}
                  vectorEffect="non-scaling-stroke"
                  rx={Math.min(0.12, Math.min(r.w, r.h) * 0.03)}
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

          {!snapshot &&
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
