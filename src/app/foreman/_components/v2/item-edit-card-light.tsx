"use client";

import { useState } from "react";
import { ChevronDown, X, TrendingUp } from "lucide-react";
import type { CostType } from "@prisma/client";
import type { EditableItem } from "../item-edit-card";
import { SupplierPickerLight } from "./supplier-picker-light";

interface ItemEditCardLightProps {
  item: EditableItem & { priceIncreaseFlag?: boolean; previousUnitPrice?: string | null };
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
  MATERIAL: "bg-emerald-100 text-emerald-700",
  LABOR: "bg-sky-100 text-sky-700",
  SUBCONTRACT: "bg-violet-100 text-violet-700",
  EQUIPMENT: "bg-amber-100 text-amber-700",
  OVERHEAD: "bg-slate-100 text-slate-700",
  OTHER: "bg-slate-100 text-slate-700",
};

function formatNum(s: string | null): string {
  if (!s) return "—";
  const n = parseFloat(s.replace(",", "."));
  if (!isFinite(n)) return s;
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 3 });
}

export function ItemEditCardLight({ item, index, onChange, onDelete }: ItemEditCardLightProps) {
  const [open, setOpen] = useState(false);
  const lowConfidence = item.confidence !== null && item.confidence < 0.6;
  const badge = COST_TYPE_LABELS[item.costType] ?? "?";
  const badgeClass = COST_TYPE_CLASSES[item.costType] ?? "bg-slate-100 text-slate-700";
  const priceUp = !!item.priceIncreaseFlag;

  return (
    <div
      className={`rounded-xl border bg-white overflow-hidden transition ${
        lowConfidence ? "border-amber-300" : priceUp ? "border-rose-200" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-slate-50 transition"
      >
        <span className="text-[11px] text-slate-400 font-mono w-5 shrink-0 tabular-nums">
          {index + 1}
        </span>
        <span
          className={`text-[10px] font-extrabold uppercase rounded px-1.5 py-0.5 shrink-0 ${badgeClass}`}
        >
          {badge}
        </span>
        <span className="flex-1 min-w-0 text-[13px] font-medium text-slate-900 truncate">
          {item.title || <span className="text-slate-400 italic">без назви</span>}
        </span>
        {priceUp && (
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-100 text-rose-600 shrink-0"
            title="Ціна зросла"
            aria-label="Ціна зросла"
          >
            <TrendingUp size={11} strokeWidth={2.5} />
          </span>
        )}
        <span className="text-[12px] text-slate-500 shrink-0 tabular-nums">
          {item.quantity
            ? `${formatNum(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`
            : ""}
        </span>
        <span className="text-[13px] font-bold text-slate-900 shrink-0 tabular-nums w-20 text-right">
          {formatNum(item.amount)}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2.5">
          {lowConfidence && (
            <div className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
              ⚠️ AI не впевнений — перевір значення
            </div>
          )}

          <div className="flex gap-1.5">
            <CostBtn
              active={item.costType === "MATERIAL"}
              onClick={() => onChange({ ...item, costType: "MATERIAL" })}
              activeClass="bg-emerald-600 text-white"
            >
              Матеріал
            </CostBtn>
            <CostBtn
              active={item.costType === "LABOR"}
              onClick={() => onChange({ ...item, costType: "LABOR" })}
              activeClass="bg-sky-600 text-white"
            >
              Робота
            </CostBtn>
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center justify-center px-3 min-h-[36px] rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 active:bg-rose-100"
              aria-label="Видалити"
            >
              <X size={14} />
            </button>
          </div>

          <input
            type="text"
            value={item.title}
            onChange={(e) => onChange({ ...item, title: e.target.value })}
            placeholder="Назва"
            className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-indigo-500 focus:outline-none"
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumInput
              value={item.quantity ?? ""}
              onChange={(v) => onChange({ ...item, quantity: v })}
              placeholder="К-сть"
            />
            <input
              type="text"
              value={item.unit ?? ""}
              onChange={(e) => onChange({ ...item, unit: e.target.value })}
              placeholder="Од."
              className="px-2 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm text-center focus:border-indigo-500 focus:outline-none"
            />
            <NumInput
              value={item.unitPrice ?? ""}
              onChange={(v) => onChange({ ...item, unitPrice: v })}
              placeholder="Ціна"
            />
            <NumInput
              value={item.amount}
              onChange={(v) => onChange({ ...item, amount: v })}
              placeholder="Сума"
              emphasize
            />
          </div>

          {priceUp && item.previousUnitPrice && (
            <div className="text-[11px] text-rose-700 bg-rose-50 rounded px-2 py-1.5 leading-snug">
              Раніше у цього постачальника ціна була{" "}
              <strong>{formatNum(item.previousUnitPrice)} ₴</strong>. Перевір на касі.
            </div>
          )}

          {(item.costType === "MATERIAL" || item.costType === "SUBCONTRACT") && (
            <div>
              <div className="text-[10px] uppercase font-extrabold text-slate-400 mb-1.5 tracking-wider">
                Постачальник
              </div>
              <SupplierPickerLight
                value={item.counterpartyId}
                guess={item.supplierGuess}
                preselectedName={item.counterpartyName}
                onChange={(next) =>
                  onChange({
                    ...item,
                    counterpartyId: next.counterpartyId,
                    supplierGuess: next.supplierGuess,
                  })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CostBtn({
  active,
  activeClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition ${
        active ? activeClass : "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
  emphasize,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  emphasize?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      pattern="[0-9.,]*"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`px-2 py-2 rounded-lg border text-sm text-center focus:outline-none ${
        emphasize
          ? "bg-indigo-50 border-indigo-200 text-slate-900 font-bold focus:border-indigo-500"
          : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500"
      }`}
    />
  );
}
