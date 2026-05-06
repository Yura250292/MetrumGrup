"use client";

import { useState } from "react";
import { CostType } from "@prisma/client";

export interface EditableItem {
  id: string;
  costType: CostType;
  title: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string;
  currency: string;
  confidence: number | null;
}

interface ItemEditCardProps {
  item: EditableItem;
  index: number;
  onChange: (item: EditableItem) => void;
  onDelete: () => void;
}

const COST_TYPE_LABELS: Partial<Record<CostType, string>> = {
  MATERIAL: "МАТ",
  LABOR: "РОБ",
  SUBCONTRACT: "ПДР",
  EQUIPMENT: "ТЕХ",
  OVERHEAD: "НАК",
  OTHER: "ІНШ",
};

const COST_TYPE_CLASSES: Partial<Record<CostType, string>> = {
  MATERIAL: "bg-emerald-500/15 text-emerald-400",
  LABOR: "bg-blue-500/15 text-blue-400",
  SUBCONTRACT: "bg-violet-500/15 text-violet-400",
  EQUIPMENT: "bg-amber-500/15 text-amber-400",
  OVERHEAD: "bg-zinc-700/50 text-zinc-300",
  OTHER: "bg-zinc-700/50 text-zinc-300",
};

function formatNum(s: string | null): string {
  if (!s) return "—";
  const n = parseFloat(s.replace(",", "."));
  if (!isFinite(n)) return s;
  // Show up to 3 decimals, trim trailing zeros
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 3 });
}

export function ItemEditCard({ item, index, onChange, onDelete }: ItemEditCardProps) {
  const [open, setOpen] = useState(false);
  const lowConfidence = item.confidence !== null && item.confidence < 0.6;
  const badge = COST_TYPE_LABELS[item.costType] ?? "?";
  const badgeClass = COST_TYPE_CLASSES[item.costType] ?? "bg-zinc-700/50 text-zinc-300";

  return (
    <div
      className={`rounded-xl border ${lowConfidence ? "border-amber-500/50" : "border-zinc-800"} bg-zinc-900 overflow-hidden`}
    >
      {/* Compact summary row — завжди видно */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-zinc-800/50 transition"
      >
        <span className="text-xs text-zinc-500 font-mono w-5 shrink-0">{index + 1}</span>
        <span
          className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 shrink-0 ${badgeClass}`}
        >
          {badge}
        </span>
        <span className="flex-1 min-w-0 text-sm font-medium text-white truncate">
          {item.title || <span className="text-zinc-500 italic">без назви</span>}
        </span>
        <span className="text-xs text-zinc-400 shrink-0 tabular-nums">
          {item.quantity ? `${formatNum(item.quantity)}${item.unit ? ` ${item.unit}` : ""}` : ""}
        </span>
        <span className="text-sm font-bold text-emerald-400 shrink-0 tabular-nums w-20 text-right">
          {formatNum(item.amount)}
        </span>
        <span
          className="text-zinc-500 shrink-0 transition-transform text-xs"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          ▶
        </span>
      </button>

      {/* Expanded edit panel — лише при tap */}
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 space-y-2.5">
          {lowConfidence && (
            <div className="text-[11px] text-amber-400 bg-amber-500/10 rounded px-2 py-1">
              ⚠️ AI не впевнений — перевір значення
            </div>
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onChange({ ...item, costType: "MATERIAL" })}
              className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition ${
                item.costType === "MATERIAL"
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              Матеріал
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...item, costType: "LABOR" })}
              className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition ${
                item.costType === "LABOR" ? "bg-blue-500 text-white" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              Робота
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="px-3 min-h-[36px] rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 active:bg-rose-500/40"
            >
              ✕
            </button>
          </div>

          <input
            type="text"
            value={item.title}
            onChange={(e) => onChange({ ...item, title: e.target.value })}
            placeholder="Назва"
            className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white text-sm focus:border-emerald-500 focus:outline-none"
          />

          <div className="grid grid-cols-4 gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              value={item.quantity ?? ""}
              onChange={(e) => onChange({ ...item, quantity: e.target.value })}
              placeholder="К-сть"
              className="px-2 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white text-sm text-center focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="text"
              value={item.unit ?? ""}
              onChange={(e) => onChange({ ...item, unit: e.target.value })}
              placeholder="Од."
              className="px-2 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white text-sm text-center focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              value={item.unitPrice ?? ""}
              onChange={(e) => onChange({ ...item, unitPrice: e.target.value })}
              placeholder="Ціна"
              className="px-2 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white text-sm text-center focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              value={item.amount}
              onChange={(e) => onChange({ ...item, amount: e.target.value })}
              placeholder="Сума"
              className="px-2 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-white text-sm font-semibold text-center focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-[10px] text-zinc-500 uppercase font-semibold text-center">
            <span>К-сть</span>
            <span>Од.</span>
            <span>Ціна</span>
            <span>Сума</span>
          </div>
        </div>
      )}
    </div>
  );
}
