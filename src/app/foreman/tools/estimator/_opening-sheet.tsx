"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DoorOpen, Square, Trash2, X } from "lucide-react";
import type { Side } from "@/lib/foreman/geometry";
import { parseNum, formatNum } from "@/lib/foreman/format";
import type { Opening, OpeningType } from "./_types";

type OpeningSheetMode = "add" | "edit";

interface Props {
  mode: OpeningSheetMode;
  roomId: string;
  /** edge lengths по сторонах кімнати, м */
  edgeLengths: Record<Side, number>;
  ceilingHeight: number;
  existing?: Opening;
  onClose: () => void;
  onConfirm: (op: Omit<Opening, "id">) => void;
  onDelete?: () => void;
}

const SIDE_LABELS: Record<Side, string> = {
  N: "Згори",
  E: "Справа",
  S: "Знизу",
  W: "Зліва",
};

const DEFAULTS: Record<OpeningType, { width: number; height: number }> = {
  door: { width: 0.9, height: 2.1 },
  window: { width: 1.2, height: 1.4 },
};

export function OpeningSheet({
  mode,
  edgeLengths,
  ceilingHeight,
  existing,
  onClose,
  onConfirm,
  onDelete,
}: Props) {
  const [type, setType] = useState<OpeningType>(existing?.type ?? "door");
  const [side, setSide] = useState<Side>(existing?.side ?? "S");
  const [offset, setOffset] = useState(String(existing?.offset ?? 0));
  const [width, setWidth] = useState(
    String(existing?.width ?? DEFAULTS["door"].width),
  );
  const [height, setHeight] = useState(
    String(existing?.height ?? DEFAULTS["door"].height),
  );

  // на зміну типу — підставити типові розміри (тільки в режимі add)
  useEffect(() => {
    if (mode === "add") {
      setWidth(String(DEFAULTS[type].width));
      setHeight(String(DEFAULTS[type].height));
    }
  }, [type, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const o = parseNum(offset);
  const w = parseNum(width);
  const h = parseNum(height);
  const edgeLen = edgeLengths[side];

  const validation = useMemo(() => {
    if (w <= 0 || h <= 0) return "Введіть розміри";
    if (h > ceilingHeight) return `Висота не може бути більшою за ${ceilingHeight} м`;
    if (o < 0) return "Зсув не може бути від'ємним";
    if (o + w > edgeLen + 1e-6) return `Проріз виходить за стіну (max ${formatNum(edgeLen - w)} м)`;
    return null;
  }, [w, h, o, edgeLen, ceilingHeight]);

  const isEdit = mode === "edit";

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
        className="w-full max-w-md bg-zinc-950 border-t border-white/10 rounded-t-3xl p-5 space-y-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">
            {isEdit ? "Редагувати проріз" : "Новий проріз"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 transition"
            aria-label="Закрити"
          >
            <X size={18} className="text-zinc-300" />
          </button>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Тип
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["door", "window"] as OpeningType[]).map((t) => {
              const active = type === t;
              const Icon = t === "door" ? DoorOpen : Square;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-sm font-semibold transition border active:scale-95 ${
                    active
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-100"
                      : "bg-white/[0.03] border-white/10 text-zinc-300"
                  }`}
                >
                  <Icon size={16} />
                  {t === "door" ? "Двері" : "Вікно"}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Стіна
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(["N", "E", "S", "W"] as Side[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`min-h-[44px] rounded-xl text-xs font-semibold transition border active:scale-95 ${
                  side === s
                    ? "bg-violet-500/20 border-violet-500/50 text-violet-100"
                    : "bg-white/[0.03] border-white/10 text-zinc-300"
                }`}
              >
                {SIDE_LABELS[s]}
                <div className="text-[9px] opacity-70 tabular-nums">
                  {formatNum(edgeLengths[s])} м
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
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
              className="mt-1 w-full px-3 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Висота, м
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
        </div>

        <div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Зсув від кута, м
            </span>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              className="mt-1 w-full px-3 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
            />
          </label>
          <div className="flex gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => setOffset("0")}
              className="flex-1 text-[11px] py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-zinc-300 active:scale-95"
            >
              ← Зліва
            </button>
            <button
              type="button"
              onClick={() => setOffset(String(Math.max(0, (edgeLen - w) / 2)))}
              className="flex-1 text-[11px] py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-zinc-300 active:scale-95"
            >
              По центру
            </button>
            <button
              type="button"
              onClick={() => setOffset(String(Math.max(0, edgeLen - w)))}
              className="flex-1 text-[11px] py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-zinc-300 active:scale-95"
            >
              Справа →
            </button>
          </div>
        </div>

        {validation && (
          <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {validation}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 active:scale-95 transition"
              aria-label="Видалити проріз"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            type="button"
            disabled={!!validation}
            onClick={() =>
              onConfirm({
                roomId: existing?.roomId ?? "",
                side,
                type,
                offset: o,
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
