"use client";

/**
 * Before/After порівняльний слайдер. Перетягуєш бігунок — ліворуч видно
 * оригінал, праворуч — результат. Reused у foreman estimator photoreal
 * рендері і admin-v2 ai-render вкладці.
 */

import { useCallback, useRef, useState } from "react";

interface Props {
  inputUrl: string;
  outputUrl: string;
  inputLabel?: string;
  outputLabel?: string;
  /** Aspect ratio CSS (default 4/3). */
  aspectClassName?: string;
}

export function ComparisonSlider({
  inputUrl,
  outputUrl,
  inputLabel = "Плaн",
  outputLabel = "Photoreal",
  aspectClassName = "aspect-[4/3]",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setIsDragging(true);
      updatePosition(e.clientX);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [updatePosition],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updatePosition(e.clientX);
    },
    [isDragging, updatePosition],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${aspectClassName} overflow-hidden rounded-2xl cursor-col-resize select-none bg-zinc-950 border border-white/10`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ touchAction: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={outputUrl}
        alt={outputLabel}
        className="absolute inset-0 w-full h-full object-contain"
        draggable={false}
      />
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={inputUrl}
          alt={inputLabel}
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-zinc-900/80 border border-white/10 text-[10px] font-bold text-zinc-200 backdrop-blur uppercase tracking-wider">
        {inputLabel}
      </div>
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-violet-500/30 border border-violet-500/50 text-[10px] font-bold text-violet-100 backdrop-blur uppercase tracking-wider">
        {outputLabel}
      </div>

      {/* Drag handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
        style={{ left: `${position}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white border-2 border-zinc-900 shadow-lg flex items-center justify-center pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3L2 7l3 4M9 3l3 4-3 4" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
