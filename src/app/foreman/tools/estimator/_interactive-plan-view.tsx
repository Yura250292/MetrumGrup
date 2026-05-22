"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCw } from "lucide-react";
import { bbox } from "@/lib/foreman/geometry";
import type { Room, Side } from "@/lib/foreman/geometry";
import type { FloorPlan, FurnitureItem } from "./_types";
import { PlanSvg } from "./_plan-svg";

interface View {
  scale: number;
  tx: number;
  ty: number;
  rotation: number;
}

const DEFAULT_VIEW: View = { scale: 1, tx: 0, ty: 0, rotation: 0 };

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

interface Props {
  plan: FloorPlan;
  onPlusClick?: (parentId: string, side: Side) => void;
  onRoomTap?: (room: Room) => void;
  onWallTap?: (roomId: string, side: Side, offset: number) => void;
  onFurnitureTap?: (item: FurnitureItem) => void;
  viewMode?: "rooms" | "openings";
  /** Додатковий UI у верхньому-лівому куті канви (наприклад, "Прорізи" toggle). */
  topLeftOverlay?: React.ReactNode;
  /** Бажане співвідношення сторін канви; "auto" → з bbox. */
  aspect?: "auto" | "square" | "4/3" | "2/1";
  /** Реактивний key — коли план суттєво змінився, view resets. Default: rooms.length. */
  resetKey?: string | number;
}

/**
 * Спільна інтерактивна канва з zoom (pinch + wheel + buttons),
 * pan (1-finger drag), rotate 90°, fit-to-content. Використовується у кроці
 * "План" і "Візуалізація".
 */
export function InteractivePlanView({
  plan,
  onPlusClick,
  onRoomTap,
  onWallTap,
  onFurnitureTap,
  viewMode = "rooms",
  topLeftOverlay,
  aspect = "auto",
  resetKey,
}: Props) {
  const b = bbox(plan.rooms);
  const ratio = b.w === 0 || b.h === 0 ? 1 : b.w / b.h;
  const aspectClass =
    aspect === "auto"
      ? ratio > 2.2
        ? "aspect-[2/1]"
        : ratio < 0.45
          ? "aspect-[1/2]"
          : "aspect-[4/3]"
      : aspect === "square"
        ? "aspect-square"
        : aspect === "2/1"
          ? "aspect-[2/1]"
          : "aspect-[4/3]";

  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Auto-fit при істотній зміні плану
  const fitKey = resetKey ?? plan.rooms.length;
  const prevFitKeyRef = useRef(fitKey);
  useEffect(() => {
    if (fitKey !== prevFitKeyRef.current) {
      setView(DEFAULT_VIEW);
      prevFitKeyRef.current = fitKey;
    }
  }, [fitKey]);

  const svgWrapRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const bboxRef = useRef({ w: b.w, h: b.h });
  useEffect(() => {
    bboxRef.current = { w: b.w, h: b.h };
  }, [b.w, b.h]);

  // rAF-throttle: native pointermove events fire 60-120 Hz, iOS Safari OOM
  // при 27+ меблях у SVG re-render. Накопичуємо найсвіжіший view і коммітимо
  // один раз на frame.
  const rafIdRef = useRef<number | null>(null);
  const pendingViewRef = useRef<View | null>(null);
  const scheduleView = (next: View) => {
    pendingViewRef.current = next;
    viewRef.current = next; // зберігаємо ref у sync негайно для наступних handlers
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const p = pendingViewRef.current;
      pendingViewRef.current = null;
      if (p) setView(p);
    });
  };

  useEffect(() => {
    const el = svgWrapRef.current;
    if (!el) return;

    const safeScale = (s: number) =>
      Number.isFinite(s) ? clamp(s, 0.4, 4) : viewRef.current.scale;
    const safeOffset = (o: number) => (Number.isFinite(o) ? o : 0);

    const onPointerDown = (e: PointerEvent) => {
      try {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const v = viewRef.current;
        if (pointersRef.current.size === 1) {
          dragStartRef.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
        } else if (pointersRef.current.size === 2) {
          const pts = Array.from(pointersRef.current.values());
          const dx = pts[0].x - pts[1].x;
          const dy = pts[0].y - pts[1].y;
          const dist = Math.hypot(dx, dy);
          lastPinchRef.current = { dist: dist > 0 ? dist : 1, scale: v.scale };
          dragStartRef.current = null;
        }
      } catch {
        /* defensive */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      try {
        if (!pointersRef.current.has(e.pointerId)) return;
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointersRef.current.size === 2 && lastPinchRef.current) {
          const pts = Array.from(pointersRef.current.values());
          const dx = pts[0].x - pts[1].x;
          const dy = pts[0].y - pts[1].y;
          const dist = Math.hypot(dx, dy);
          const baseDist = lastPinchRef.current.dist;
          if (baseDist > 0 && dist > 0) {
            const newScale = safeScale((dist / baseDist) * lastPinchRef.current.scale);
            scheduleView({ ...viewRef.current, scale: newScale });
          }
          e.preventDefault();
        } else if (pointersRef.current.size === 1 && dragStartRef.current) {
          const px = el.clientWidth;
          if (px <= 0) return;
          const { w: bw, h: bh } = bboxRef.current;
          const padW = Math.max(0.6, Math.max(bw, bh) * 0.12) * 2;
          const vbW = (bw || 1) + padW;
          const metersPerPx = vbW / px;
          const dx = (e.clientX - dragStartRef.current.x) * metersPerPx;
          const dy = (e.clientY - dragStartRef.current.y) * metersPerPx;
          scheduleView({
            ...viewRef.current,
            tx: safeOffset(dragStartRef.current!.tx + dx),
            ty: safeOffset(dragStartRef.current!.ty + dy),
          });
        }
      } catch {
        /* defensive */
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      try {
        pointersRef.current.delete(e.pointerId);
        if (pointersRef.current.size < 2) lastPinchRef.current = null;
        if (pointersRef.current.size === 0) dragStartRef.current = null;
      } catch {
        /* defensive */
      }
    };

    const onWheel = (e: WheelEvent) => {
      try {
        e.preventDefault();
        const delta = -Math.sign(e.deltaY) * 0.15;
        const v = viewRef.current;
        scheduleView({ ...v, scale: safeScale(v.scale * (1 + delta)) });
      } catch {
        /* defensive */
      }
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
      pointersRef.current.clear();
      lastPinchRef.current = null;
      dragStartRef.current = null;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingViewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div
        ref={svgWrapRef}
        className={`rounded-2xl bg-white border border-zinc-700/40 overflow-hidden touch-none ${aspectClass}`}
        style={{ touchAction: "none" }}
      >
        <PlanSvg
          plan={plan}
          onPlusClick={onPlusClick}
          onRoomTap={onRoomTap}
          onWallTap={onWallTap}
          onFurnitureTap={onFurnitureTap}
          viewMode={viewMode}
          viewTransform={view}
          className="w-full h-full select-none"
        />
      </div>

      {topLeftOverlay && (
        <div className="absolute top-2 left-2 flex flex-col gap-1.5">
          {topLeftOverlay}
        </div>
      )}

      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        <ViewBtn
          onClick={() =>
            setView((v) => ({ ...v, scale: clamp(v.scale * 1.25, 0.4, 4) }))
          }
          label="Збільшити"
        >
          <Plus size={14} />
        </ViewBtn>
        <ViewBtn
          onClick={() =>
            setView((v) => ({ ...v, scale: clamp(v.scale * 0.8, 0.4, 4) }))
          }
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

      {(view.scale !== 1 ||
        view.rotation !== 0 ||
        view.tx !== 0 ||
        view.ty !== 0) && (
        <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-zinc-900/80 border border-white/10 text-[10px] text-zinc-300 font-mono backdrop-blur">
          {(view.scale * 100).toFixed(0)}%
          {view.rotation !== 0 && ` · ↺${view.rotation}°`}
        </div>
      )}
    </div>
  );
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
