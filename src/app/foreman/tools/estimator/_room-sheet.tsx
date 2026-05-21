"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import type { Room, Side } from "@/lib/foreman/geometry";
import { parseNum, formatNum } from "@/lib/foreman/format";

export type RoomSheetMode = "add" | "edit";

interface Props {
  mode: RoomSheetMode;
  parentSide?: Side;
  defaultHeight: number;
  room?: Room;
  onClose: () => void;
  onConfirm: (values: {
    name: string;
    length: number;
    width: number;
    height: number;
  }) => void;
  onDelete?: () => void;
}

const SIDE_LABELS: Record<Side, string> = {
  N: "Згори",
  S: "Знизу",
  E: "Справа",
  W: "Зліва",
};

export function RoomSheet({
  mode,
  parentSide,
  defaultHeight,
  room,
  onClose,
  onConfirm,
  onDelete,
}: Props) {
  const [name, setName] = useState(room?.name ?? "");
  const [length, setLength] = useState(room ? String(room.w) : "");
  const [width, setWidth] = useState(room ? String(room.h) : "");
  const [height, setHeight] = useState(String(room?.ceilingHeight ?? defaultHeight));

  // ESC closes
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
        className="w-full max-w-md bg-zinc-950 border-t border-white/10 rounded-t-3xl p-5 space-y-4 pb-safe"
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
