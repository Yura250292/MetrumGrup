"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCw, Ruler } from "lucide-react";
import { bbox } from "@/lib/foreman/geometry";
import type { Room, Side } from "@/lib/foreman/geometry";
import { parseNum, formatNum } from "@/lib/foreman/format";
import type { FloorPlan } from "./_types";
import { PlanSvg } from "./_plan-svg";

interface Props {
  plan: FloorPlan;
  onChangeDefaultCeiling: (value: number) => void;
  onAddFirst: (length: number, width: number, name: string, height: number) => void;
  onPlusClick: (parentId: string, side: Side) => void;
  onRoomTap: (room: Room) => void;
}

export function PlanCanvas({
  plan,
  onChangeDefaultCeiling,
  onAddFirst,
  onPlusClick,
  onRoomTap,
}: Props) {
  const hasRooms = plan.rooms.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-4 space-y-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Висота стелі за замовчуванням, м
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={String(plan.defaultCeilingHeight)}
            onChange={(e) => {
              const v = parseNum(e.target.value);
              if (v > 0) onChangeDefaultCeiling(v);
            }}
            className="mt-1 w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base focus:border-violet-500/60 focus:outline-none"
          />
          <span className="block mt-1 text-[11px] text-zinc-500">
            Можна змінити окремо для кожної кімнати.
          </span>
        </label>
      </div>

      {!hasRooms ? (
        <FirstRoomForm defaultHeight={plan.defaultCeilingHeight} onSubmit={onAddFirst} />
      ) : (
        <PlanWithControls plan={plan} onPlusClick={onPlusClick} onRoomTap={onRoomTap} />
      )}
    </div>
  );
}

function FirstRoomForm({
  defaultHeight,
  onSubmit,
}: {
  defaultHeight: number;
  onSubmit: (length: number, width: number, name: string, height: number) => void;
}) {
  const [name, setName] = useState("Основна");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const l = parseNum(length);
  const w = parseNum(width);
  const valid = l > 0 && w > 0;

  return (
    <div className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-violet-300">
        <Ruler size={16} />
        <span className="text-xs uppercase tracking-wider font-bold">Перша кімната</span>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed">
        Введіть розміри першої кімнати — це буде стартовий прямокутник плану.
      </p>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Назва</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Кімната"
          className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base focus:border-violet-500/60 focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Довжина, м
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="4"
            className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Ширина, м
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            placeholder="3"
            className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
          />
        </label>
      </div>

      <div className="text-xs text-zinc-500 text-right tabular-nums">
        = {formatNum(l * w)} м²
      </div>

      <button
        type="button"
        disabled={!valid}
        onClick={() => onSubmit(l, w, name.trim() || "Кімната", defaultHeight)}
        className="w-full min-h-[48px] rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm font-semibold active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
      >
        Створити план
      </button>
    </div>
  );
}

interface View {
  scale: number;
  tx: number;
  ty: number;
  rotation: number;
}

const DEFAULT_VIEW: View = { scale: 1, tx: 0, ty: 0, rotation: 0 };

function PlanWithControls({
  plan,
  onPlusClick,
  onRoomTap,
}: {
  plan: FloorPlan;
  onPlusClick: (parentId: string, side: Side) => void;
  onRoomTap: (room: Room) => void;
}) {
  const b = useMemo(() => bbox(plan.rooms), [plan.rooms]);
  const ratio = b.w === 0 || b.h === 0 ? 1 : b.w / b.h;
  const aspectClass =
    ratio > 2.2 ? "aspect-[2/1]" : ratio < 0.45 ? "aspect-[1/2]" : "aspect-[4/3]";
  const totalArea = useMemo(
    () => plan.rooms.reduce((sum, r) => sum + r.w * r.h, 0),
    [plan.rooms],
  );

  const [view, setView] = useState<View>(DEFAULT_VIEW);
  // Скидати view коли план суттєво змінюється (нова кімната → auto-fit).
  const prevRoomCountRef = useRef(plan.rooms.length);
  useEffect(() => {
    if (plan.rooms.length !== prevRoomCountRef.current) {
      setView(DEFAULT_VIEW);
      prevRoomCountRef.current = plan.rooms.length;
    }
  }, [plan.rooms.length]);

  // Gestures: 1-finger pan, 2-finger pinch zoom on SVG.
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    const el = svgWrapRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      // Не блокувати клік по SVG-елементах (rect/+); ставимо pan тільки на 1 палець по pустому місці.
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 1) {
        dragStartRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      } else if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        lastPinchRef.current = { dist: Math.hypot(dx, dy), scale: view.scale };
        dragStartRef.current = null;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 2 && lastPinchRef.current) {
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy);
        if (lastPinchRef.current.dist > 0) {
          const newScale = clamp(
            (dist / lastPinchRef.current.dist) * lastPinchRef.current.scale,
            0.4,
            4,
          );
          setView((v) => ({ ...v, scale: newScale }));
        }
        e.preventDefault();
      } else if (pointersRef.current.size === 1 && dragStartRef.current) {
        const px = el.clientWidth;
        const padW = Math.max(0.6, Math.max(b.w, b.h) * 0.12) * 2;
        const vbW = (b.w || 1) + padW;
        const metersPerPx = vbW / Math.max(px, 1);
        const dx = (e.clientX - dragStartRef.current.x) * metersPerPx;
        const dy = (e.clientY - dragStartRef.current.y) * metersPerPx;
        setView((v) => ({
          ...v,
          tx: dragStartRef.current!.tx + dx,
          ty: dragStartRef.current!.ty + dy,
        }));
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) lastPinchRef.current = null;
      if (pointersRef.current.size === 0) dragStartRef.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -Math.sign(e.deltaY) * 0.15;
      setView((v) => ({ ...v, scale: clamp(v.scale * (1 + delta), 0.4, 4) }));
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [b.w, b.h, view.scale, view.tx, view.ty]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={svgWrapRef}
          className={`rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden touch-none ${aspectClass}`}
          style={{ touchAction: "none" }}
        >
          <PlanSvg
            plan={plan}
            onPlusClick={onPlusClick}
            onRoomTap={onRoomTap}
            viewTransform={view}
            className="w-full h-full select-none"
          />
        </div>

        {/* view controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          <ViewBtn
            onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale * 1.25, 0.4, 4) }))}
            label="Збільшити"
          >
            <Plus size={14} />
          </ViewBtn>
          <ViewBtn
            onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale * 0.8, 0.4, 4) }))}
            label="Зменшити"
          >
            <Minus size={14} />
          </ViewBtn>
          <ViewBtn
            onClick={() => setView((v) => ({ ...v, rotation: (v.rotation + 90) % 360 }))}
            label="Обернути"
          >
            <RotateCw size={14} />
          </ViewBtn>
          <ViewBtn onClick={() => setView(DEFAULT_VIEW)} label="Підігнати">
            <Maximize2 size={14} />
          </ViewBtn>
        </div>

        {(view.scale !== 1 || view.rotation !== 0 || view.tx !== 0 || view.ty !== 0) && (
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-zinc-900/80 border border-white/10 text-[10px] text-zinc-300 font-mono backdrop-blur">
            {(view.scale * 100).toFixed(0)}%
            {view.rotation !== 0 && ` · ↺${view.rotation}°`}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Кімнат" value={String(plan.rooms.length)} />
        <Stat label="Загальна підлога" value={`${formatNum(totalArea)} м²`} />
        <Stat label="Розміри" value={`${formatNum(b.w)}×${formatNum(b.h)} м`} />
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed text-center px-2">
        Тап «+» — додати кімнату. Тап по кімнаті — висота, прорізи, видалення.
        Пінч/перетягування — масштаб і огляд.
      </p>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function ViewBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 rounded-lg bg-zinc-900/85 border border-white/10 text-zinc-200 flex items-center justify-center active:scale-90 hover:bg-zinc-800 transition backdrop-blur"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 px-2 py-2">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
      <div className="text-sm font-semibold text-zinc-100 tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
