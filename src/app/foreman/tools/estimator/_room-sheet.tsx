"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DoorOpen, Plus, Square, Trash2, X } from "lucide-react";
import type { Align, Room, Side } from "@/lib/foreman/geometry";
import { parseNum, formatNum } from "@/lib/foreman/format";
import type { Opening } from "./_types";

export type RoomSheetMode = "add" | "edit";

interface Props {
  mode: RoomSheetMode;
  parentSide?: Side;
  /** довжина грані батьківської кімнати (м) — для відображення лімітів. */
  parentEdgeLen?: number;
  defaultHeight: number;
  room?: Room;
  /** Прорізи цієї кімнати (тільки edit-режим). */
  openings?: Opening[];
  onClose: () => void;
  onConfirm: (values: {
    name: string;
    length: number;
    width: number;
    height: number;
    align: Align;
  }) => void;
  onDelete?: () => void;
  onAddOpening?: () => void;
  onEditOpening?: (opening: Opening) => void;
}

const SIDE_LABELS: Record<Side, string> = {
  N: "Згори",
  S: "Знизу",
  E: "Справа",
  W: "Зліва",
};

const ALIGN_LABELS_HORIZONTAL: Record<Align, string> = {
  start: "← Зліва",
  center: "По центру",
  end: "Справа →",
};

const ALIGN_LABELS_VERTICAL: Record<Align, string> = {
  start: "↑ Зверху",
  center: "По центру",
  end: "Знизу ↓",
};

export function RoomSheet({
  mode,
  parentSide,
  parentEdgeLen,
  defaultHeight,
  room,
  openings,
  onClose,
  onConfirm,
  onDelete,
  onAddOpening,
  onEditOpening,
}: Props) {
  const [name, setName] = useState(room?.name ?? "");
  const [length, setLength] = useState(room ? String(room.w) : "");
  const [width, setWidth] = useState(room ? String(room.h) : "");
  const [height, setHeight] = useState(String(room?.ceilingHeight ?? defaultHeight));
  const [align, setAlign] = useState<Align>("start");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const l = parseNum(length);
  const w = parseNum(width);
  const h = parseNum(height);
  const isEdit = mode === "edit";
  const valid = isEdit ? h > 0 : l > 0 && w > 0 && h > 0;

  const alignLabels =
    parentSide === "E" || parentSide === "W"
      ? ALIGN_LABELS_VERTICAL
      : ALIGN_LABELS_HORIZONTAL;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="w-full max-w-md bg-zinc-950 border-t border-white/10 rounded-t-3xl p-5 space-y-4 max-h-[88dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">
              {isEdit ? "Редагувати кімнату" : "Нова кімната"}
            </h3>
            {!isEdit && parentSide && (
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Приклеїти {SIDE_LABELS[parentSide].toLowerCase()}
                {parentEdgeLen != null && ` · стіна ${formatNum(parentEdgeLen)} м`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 transition"
            aria-label="Закрити"
          >
            <X size={18} className="text-zinc-300" />
          </button>
        </div>

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Назва
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isEdit ? room?.name : "Коридор / Кухня / …"}
            className="mt-1 w-full px-3 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-base focus:border-violet-500/60 focus:outline-none"
          />
        </label>

        {!isEdit && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Довжина (вздовж стіни), м
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  placeholder="3"
                  className="mt-1 w-full px-3 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Ширина (вглиб), м
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="2"
                  className="mt-1 w-full px-3 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="text-xs text-zinc-500 text-right tabular-nums">
              = {formatNum(l * w)} м²
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                Прив'язка до стіни
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["start", "center", "end"] as Align[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAlign(a)}
                    className={`min-h-[40px] rounded-lg text-xs font-semibold transition border active:scale-95 ${
                      align === a
                        ? "bg-violet-500/20 border-violet-500/50 text-violet-100"
                        : "bg-white/[0.03] border-white/10 text-zinc-300"
                    }`}
                  >
                    {alignLabels[a]}
                  </button>
                ))}
              </div>
              {parentEdgeLen != null && l > parentEdgeLen && (
                <p className="text-[11px] text-amber-300/80 mt-1.5">
                  Кімната довша за стіну ({formatNum(parentEdgeLen)} м) — буде overhang.
                </p>
              )}
            </div>
          </>
        )}

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Висота стелі, м
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="mt-1 w-full px-3 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
          />
        </label>

        {isEdit && onAddOpening && (
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Прорізи (двері, вікна)
              </span>
              <button
                type="button"
                onClick={onAddOpening}
                className="flex items-center gap-1 text-[11px] font-semibold text-violet-300 active:scale-95 transition"
              >
                <Plus size={12} />
                Додати
              </button>
            </div>
            {openings && openings.length > 0 ? (
              <ul className="space-y-1.5">
                {openings.map((o) => {
                  const Icon = o.type === "door" ? DoorOpen : Square;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => onEditOpening?.(o)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 active:scale-[0.99] transition text-left"
                      >
                        <Icon size={14} className="text-violet-300 shrink-0" />
                        <span className="flex-1 text-xs text-zinc-200">
                          {o.type === "door" ? "Двері" : "Вікно"}
                          <span className="text-zinc-500 ml-1.5">
                            · {SIDE_LABELS[o.side].toLowerCase()} ·{" "}
                            {formatNum(o.width)}×{formatNum(o.height)} м
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[11px] text-zinc-500">
                Без прорізів. Стіни рахуються повністю.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 active:scale-95 transition"
              aria-label="Видалити кімнату"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            type="button"
            disabled={!valid}
            onClick={() =>
              onConfirm({
                name: name.trim() || (isEdit ? room?.name ?? "Кімната" : "Кімната"),
                length: l,
                width: w,
                height: h,
                align,
              })
            }
            className="flex-1 min-h-[48px] rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm font-semibold active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
          >
            {isEdit ? "Зберегти" : "Додати"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
