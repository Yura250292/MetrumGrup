"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bbox, edge, freeButtons, freeSegments } from "@/lib/foreman/geometry";
import type { Room, Side } from "@/lib/foreman/geometry";
import type { FloorPlan, FurnitureItem, Opening } from "./_types";
import { FurnitureShape } from "./_furniture-shapes";


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
    // Додатковий padding знизу і справа для зовнішніх розмірних ліній.
    const dimPad = snapshot ? 0 : Math.max(0.6, Math.max(b.w, b.h) * 0.12);
    const vb = {
      x: b.x - pad,
      y: b.y - pad,
      w: b.w + 2 * pad + dimPad,
      h: b.h + 2 * pad + dimPad,
    };
    const maxDim = Math.max(b.w, b.h, 1);
    const ratio = vb.w === 0 || vb.h === 0 ? 1 : vb.w / vb.h;
    const aspectClass =
      ratio > 2.2 ? "aspect-[2/1]" : ratio < 0.45 ? "aspect-[1/2]" : "aspect-[4/3]";
    return { b, vb, maxDim, aspectClass };
  }, [plan.rooms, snapshot]);

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

  // ─── Memoized sub-trees ────────────────────────────────────────────────
  // Ці JSX блоки НЕ залежать від viewTransform. Memoize щоб при pinch/zoom
  // (60Hz setView) ці елементи не перераховувалися і React просто перевстановлював
  // transform на одному <g>. Інакше re-render усіх ~500+ SVG-елементів кожні
  // 16ms кладе iOS Safari (OOM crash).

  const roomsJsx = useMemo(() => {
    return plan.rooms.map((r) => {
      const showDims = Math.min(r.w, r.h) >= 1.5;
      const labelFs = Math.min(r.w, r.h) * 0.14;
      return (
        <g key={r.id}>
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={openingsMode ? "rgba(251,191,36,0.06)" : "rgba(139,92,246,0.04)"}
            stroke={openingsMode ? "rgb(251,191,36)" : "rgba(229,231,235,0.9)"}
            strokeWidth={openingsMode ? strokePx + 0.4 : 2.6}
            strokeDasharray={openingsMode ? "0.25 0.25" : undefined}
            vectorEffect="non-scaling-stroke"
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
            fill="rgba(229,231,235,0.55)"
            fontSize={labelFs}
            fontWeight={400}
            pointerEvents="none"
          >
            <tspan x={r.x + r.w / 2} dy={showDims ? -labelFs * 0.4 : 0}>
              {r.name}
            </tspan>
            {showDims && (
              <tspan
                x={r.x + r.w / 2}
                dy={labelFs * 1.2}
                fontSize={labelFs * 0.65}
                fill="rgba(161,161,170,0.6)"
              >
                {r.w}×{r.h} м
              </tspan>
            )}
          </text>
        </g>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.rooms, openingsMode, onRoomTap, onWallTap]);

  /**
   * Зовнішні розмірні лінії — як на архітектурному кресленні: одна знизу
   * (загальна ширина + tick marks на кутах кімнат) і одна справа (загальна
   * глибина). Без захаращення всередині кімнат.
   */
  const externalDimsJsx = useMemo(() => {
    if (plan.rooms.length === 0 || snapshot) return null;
    const b = layout.b;
    const offset = Math.max(0.25, Math.min(b.w, b.h) * 0.06);
    const fs = Math.max(0.16, Math.min(b.w, b.h) * 0.05);
    const tickLen = Math.max(0.08, Math.min(b.w, b.h) * 0.015);

    // Унікальні x-координати кутів кімнат для tick marks по горизонталі
    const xs = Array.from(
      new Set(plan.rooms.flatMap((r) => [r.x, r.x + r.w])),
    ).sort((a, c) => a - c);
    const ys = Array.from(
      new Set(plan.rooms.flatMap((r) => [r.y, r.y + r.h])),
    ).sort((a, c) => a - c);

    const yBottom = b.y + b.h + offset;
    const xRight = b.x + b.w + offset;

    return (
      <g pointerEvents="none">
        {/* нижня лінія */}
        <line
          x1={b.x}
          y1={yBottom}
          x2={b.x + b.w}
          y2={yBottom}
          stroke="rgba(229,231,235,0.55)"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
        {xs.map((x) => (
          <line
            key={`tx-${x}`}
            x1={x}
            y1={yBottom - tickLen}
            x2={x}
            y2={yBottom + tickLen}
            stroke="rgba(229,231,235,0.6)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* підписи сегментів між ticks */}
        {xs.slice(0, -1).map((x, i) => {
          const xNext = xs[i + 1];
          const mid = (x + xNext) / 2;
          const seg = xNext - x;
          if (seg < 0.3) return null;
          return (
            <text
              key={`xseg-${i}`}
              x={mid}
              y={yBottom + fs * 1.4}
              textAnchor="middle"
              fontSize={fs}
              fill="rgba(229,231,235,0.75)"
              fontWeight={500}
            >
              {(seg * 1000).toFixed(0)}
            </text>
          );
        })}
        {/* загальна ширина */}
        <text
          x={b.x + b.w / 2}
          y={yBottom + fs * 3.0}
          textAnchor="middle"
          fontSize={fs * 0.85}
          fill="rgba(161,161,170,0.6)"
          fontStyle="italic"
        >
          всього {(b.w * 1000).toFixed(0)} мм
        </text>

        {/* права вертикальна лінія */}
        <line
          x1={xRight}
          y1={b.y}
          x2={xRight}
          y2={b.y + b.h}
          stroke="rgba(229,231,235,0.55)"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
        {ys.map((y) => (
          <line
            key={`ty-${y}`}
            x1={xRight - tickLen}
            y1={y}
            x2={xRight + tickLen}
            y2={y}
            stroke="rgba(229,231,235,0.6)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {ys.slice(0, -1).map((y, i) => {
          const yNext = ys[i + 1];
          const mid = (y + yNext) / 2;
          const seg = yNext - y;
          if (seg < 0.3) return null;
          return (
            <text
              key={`yseg-${i}`}
              transform={`rotate(-90 ${xRight + fs * 1.4} ${mid})`}
              x={xRight + fs * 1.4}
              y={mid}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fs}
              fill="rgba(229,231,235,0.75)"
              fontWeight={500}
            >
              {(seg * 1000).toFixed(0)}
            </text>
          );
        })}
        <text
          transform={`rotate(-90 ${xRight + fs * 3.0} ${b.y + b.h / 2})`}
          x={xRight + fs * 3.0}
          y={b.y + b.h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fs * 0.85}
          fill="rgba(161,161,170,0.6)"
          fontStyle="italic"
        >
          всього {(b.h * 1000).toFixed(0)} мм
        </text>
      </g>
    );
  }, [plan.rooms, layout.b, snapshot]);

  const openingsJsx = useMemo(() => {
    return plan.openings.map((o) => {
      const room = plan.rooms.find((r) => r.id === o.roomId);
      if (!room) return null;
      const p = openingPoints(room, o);
      const isDoor = o.type === "door";
      const ocx = (p.x1 + p.x2) / 2;
      const ocy = (p.y1 + p.y2) / 2;
      const isHorizontal = Math.abs(p.x2 - p.x1) > Math.abs(p.y2 - p.y1);
      const dimFs = Math.max(0.12, Math.min(room.w, room.h) * 0.07);
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
          <text
            transform={isHorizontal ? undefined : `rotate(-90 ${ocx} ${ocy})`}
            x={ocx}
            y={ocy + (isHorizontal ? dimFs * 1.6 : 0)}
            textAnchor="middle"
            dominantBaseline={isHorizontal ? "middle" : "central"}
            fontSize={dimFs}
            fill={isDoor ? "#fbbf24" : "#38bdf8"}
            fontWeight={600}
          >
            {(o.width * 1000).toFixed(0)}
          </text>
        </g>
      );
    });
  }, [plan.openings, plan.rooms]);

  const furnitureJsx = useMemo(() => {
    return plan.furniture.map((f) => {
      const room = plan.rooms.find((r) => r.id === f.roomId);
      if (!room) return null;
      return (
        <FurnitureShape
          key={f.id}
          item={f}
          wx={room.x + f.x}
          wy={room.y + f.y}
          onClick={
            onFurnitureTap && !snapshot ? () => onFurnitureTap(f) : undefined
          }
        />
      );
    });
  }, [plan.furniture, plan.rooms, onFurnitureTap, snapshot]);

  const buttonsJsx = useMemo(() => {
    if (snapshot || openingsMode) return null;
    return buttons.map((b) => (
      <g
        key={b.id}
        transform={`translate(${b.cx} ${b.cy})`}
        className="cursor-pointer"
        onClick={onPlusClick ? () => onPlusClick(b.parentId, b.side) : undefined}
      >
        <circle r={btnHitR} fill="transparent" pointerEvents="all" />
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
    ));
  }, [buttons, snapshot, openingsMode, onPlusClick, btnHitR, btnVisualR]);

  if (plan.rooms.length === 0) return null;

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg
        data-estimator-plan={snapshot ? "snapshot" : "interactive"}
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
          {roomsJsx}
          {externalDimsJsx}
          {openingsJsx}
          {furnitureJsx}
          {buttonsJsx}
        </g>
      </svg>
    </div>
  );
}

// re-export helper for callers that want edge coords
export { edge };
