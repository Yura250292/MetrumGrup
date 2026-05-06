"use client";

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
  MATERIAL: "Матеріал",
  LABOR: "Робота",
  SUBCONTRACT: "Підряд",
  EQUIPMENT: "Техніка",
  OVERHEAD: "Накладні",
  OTHER: "Інше",
};

export function ItemEditCard({ item, index, onChange, onDelete }: ItemEditCardProps) {
  const lowConfidence = item.confidence !== null && item.confidence < 0.6;

  return (
    <div
      className={`rounded-2xl bg-zinc-900 border ${lowConfidence ? "border-amber-500/60" : "border-zinc-800"} p-4 space-y-3`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-zinc-500">#{index + 1}</span>
          {lowConfidence && (
            <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5">
              Перевір
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-zinc-500 hover:text-rose-400 px-3 py-1 text-sm"
          aria-label="Видалити рядок"
        >
          Видалити
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...item, costType: "MATERIAL" })}
          className={`flex-1 min-h-[48px] rounded-xl text-base font-semibold transition ${
            item.costType === "MATERIAL"
              ? "bg-emerald-500 text-white"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          Матеріал
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...item, costType: "LABOR" })}
          className={`flex-1 min-h-[48px] rounded-xl text-base font-semibold transition ${
            item.costType === "LABOR"
              ? "bg-emerald-500 text-white"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          Робота
        </button>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase text-zinc-500">Назва</span>
        <input
          type="text"
          value={item.title}
          onChange={(e) => onChange({ ...item, title: e.target.value })}
          className="w-full mt-1 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-lg focus:border-emerald-500 focus:outline-none"
          placeholder="напр. Плитка керамічна"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-zinc-500">Кількість</span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={item.quantity ?? ""}
            onChange={(e) => onChange({ ...item, quantity: e.target.value })}
            className="w-full mt-1 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-lg focus:border-emerald-500 focus:outline-none"
            placeholder="50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-zinc-500">Од. виміру</span>
          <input
            type="text"
            value={item.unit ?? ""}
            onChange={(e) => onChange({ ...item, unit: e.target.value })}
            className="w-full mt-1 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-lg focus:border-emerald-500 focus:outline-none"
            placeholder="м²"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-zinc-500">Ціна за од.</span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={item.unitPrice ?? ""}
            onChange={(e) => onChange({ ...item, unitPrice: e.target.value })}
            className="w-full mt-1 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-lg focus:border-emerald-500 focus:outline-none"
            placeholder="1300"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-zinc-500">Сума, грн</span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={item.amount}
            onChange={(e) => onChange({ ...item, amount: e.target.value })}
            className="w-full mt-1 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/40 text-white text-lg font-semibold focus:border-emerald-500 focus:outline-none"
            placeholder="0"
          />
        </label>
      </div>

      <div className="text-xs text-zinc-500">
        Тип: <span className="text-zinc-300">{COST_TYPE_LABELS[item.costType] ?? item.costType}</span>
      </div>
    </div>
  );
}
