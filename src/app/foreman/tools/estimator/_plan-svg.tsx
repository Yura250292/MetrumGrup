"use client";

import { useMemo } from "react";
import { bbox, freeButtons, freeSegments } from "@/lib/foreman/geometry";
import type { Room, Side } from "@/lib/foreman/geometry";
import type { FloorPlan } from "./_types";

interface Props {
  plan: FloorPlan;
  /** Якщо передано — буде намальовано "+" кнопки на вільних гранях. */
  onPlusClick?: (parentId: string, side: Side) => void;
  /** Tap по тілу кімнати — редагування. */
  onRoomTap?: (room: Room) => void;
  /** Чи це snapshot для PDF — без сітки, без + кнопок. */
  snapshot?: boolean;
  className?: string;
}

export function PlanSvg({ plan, onPlusClick, onRoomTap, snapshot, className }: Props) {
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
    const btnR = Math.max(0.28, maxDim * 0.04);
    const strokeW = Math.max(0.04, maxDim * 0.005);
    const ratio = b.w === 0 || b.h === 0 ? 1 : b.w / b.h;
    const aspectClass =
      ratio > 2.2 ? "aspect-[2/1]" : ratio < 0.45 ? "aspect-[1/2]" : "aspect-[4/3]";
    return { b, vb, btnR, strokeW, aspectClass };
  }, [plan.rooms]);

  const free = useMemo(
    () => (onPlusClick ? freeSegments(plan.rooms) : null),
    [plan.rooms, onPlusClick],
  );
  const buttons = useMemo(
    () => (onPlusClick && free ? freeButtons(plan.rooms, free) : []),
    [plan.rooms, free, onPlusClick],
  );

  if (plan.rooms.length === 0) return null;

  return (
    <svg
      data-estimator-plan
      viewBox={`${layout.vb.x} ${layout.vb.y} ${layout.vb.w} ${layout.vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? `w-full h-full touch-manipulation select-none ${layout.aspectClass}`}
    >
      {!snapshot && (
        <>
          <defs>
            <pattern id="grid-1m" width="1" height="1" patternUnits="userSpaceOnUse">
              <path
                d="M 1 0 L 0 0 0 1"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={layout.strokeW * 0.3}
              />
            </pattern>
          </defs>
          <rect
            x={layout.vb.x}
            y={layout.vb.y}
            width={layout.vb.w}
            height={layout.vb.h}
            fill="url(#grid-1m)"
          />
        </>
      )}

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
              strokeWidth={layout.strokeW}
              vectorEffect="non-scaling-stroke"
              rx={Math.min(0.15, Math.min(r.w, r.h) * 0.04)}
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

      {!snapshot &&
        buttons.map((b) => (
          <g
            key={b.id}
            transform={`translate(${b.cx} ${b.cy})`}
            className="cursor-pointer"
            onClick={onPlusClick ? () => onPlusClick(b.parentId, b.side) : undefined}
          >
            <circle r={layout.btnR * 1.8} fill="transparent" pointerEvents="all" />
            <circle
              r={layout.btnR}
              fill="rgba(16,185,129,0.95)"
              stroke="#fff"
              strokeWidth={layout.strokeW * 0.6}
              vectorEffect="non-scaling-stroke"
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={layout.btnR * 1.4}
              fontWeight={700}
              fill="#fff"
              pointerEvents="none"
            >
              +
            </text>
          </g>
        ))}
    </svg>
  );
}
