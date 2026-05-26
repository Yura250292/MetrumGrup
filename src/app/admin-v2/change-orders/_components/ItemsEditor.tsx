"use client";

import { useMemo } from "react";
import { CostCodePicker } from "@/components/cost-codes/CostCodePicker";

export type DraftItem = {
  id?: string;
  costCodeId: string | null;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
  sign: 1 | -1;
};

type Props = {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  allowNegativeSign?: boolean;
  readOnly?: boolean;
};

const EMPTY_ITEM: DraftItem = {
  costCodeId: null,
  description: "",
  unit: "шт",
  qty: 1,
  unitPrice: 0,
  sign: 1,
};

export function ItemsEditor({
  items,
  onChange,
  allowNegativeSign,
  readOnly,
}: Props) {
  const total = useMemo(
    () =>
      items.reduce(
        (sum, it) =>
          sum + (it.sign === 1 ? 1 : -1) * Number(it.qty) * Number(it.unitPrice),
        0,
      ),
    [items],
  );

  function update(idx: number, patch: Partial<DraftItem>): void {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  }
  function remove(idx: number): void {
    onChange(items.filter((_, i) => i !== idx));
  }
  function add(): void {
    onChange([...items, { ...EMPTY_ITEM }]);
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-zinc-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-left text-xs text-zinc-500">
              <th className="px-3 py-2 w-[28%]">Стаття витрат</th>
              <th className="px-3 py-2">Опис</th>
              <th className="px-3 py-2 w-20">Од.</th>
              <th className="px-3 py-2 w-24 text-right">К-сть</th>
              <th className="px-3 py-2 w-28 text-right">Ціна</th>
              {allowNegativeSign && (
                <th className="px-3 py-2 w-20 text-center">±</th>
              )}
              <th className="px-3 py-2 w-32 text-right">Сума</th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const sum = (it.sign === 1 ? 1 : -1) * Number(it.qty) * Number(it.unitPrice);
              return (
                <tr key={idx} className="border-t border-zinc-100">
                  <td className="px-3 py-2 align-top">
                    <CostCodePicker
                      value={it.costCodeId}
                      onChange={(id) => update(idx, { costCodeId: id })}
                      disabled={readOnly}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.description}
                      onChange={(e) =>
                        update(idx, { description: e.target.value })
                      }
                      disabled={readOnly}
                      className="w-full px-2 py-1 rounded border border-zinc-200 text-sm focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.unit}
                      onChange={(e) => update(idx, { unit: e.target.value })}
                      disabled={readOnly}
                      className="w-full px-2 py-1 rounded border border-zinc-200 text-sm focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={it.qty}
                      onChange={(e) =>
                        update(idx, { qty: Number(e.target.value) })
                      }
                      disabled={readOnly}
                      className="w-full text-right px-2 py-1 rounded border border-zinc-200 text-sm focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={it.unitPrice}
                      onChange={(e) =>
                        update(idx, { unitPrice: Number(e.target.value) })
                      }
                      disabled={readOnly}
                      className="w-full text-right px-2 py-1 rounded border border-zinc-200 text-sm focus:border-sky-500 focus:outline-none"
                    />
                  </td>
                  {allowNegativeSign && (
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          update(idx, { sign: it.sign === 1 ? -1 : 1 })
                        }
                        disabled={readOnly}
                        className={`px-2 py-0.5 rounded text-xs ${
                          it.sign === 1
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {it.sign === 1 ? "+ ADD" : "− REMOVE"}
                      </button>
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {new Intl.NumberFormat("uk-UA", {
                      minimumFractionDigits: 2,
                    }).format(sum)}{" "}
                    ₴
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="text-zinc-400 hover:text-rose-600"
                        title="Видалити"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={allowNegativeSign ? 8 : 7}
                  className="px-3 py-6 text-center text-sm text-zinc-400"
                >
                  Додайте хоча б одну позицію.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-zinc-50">
            <tr>
              <td
                colSpan={allowNegativeSign ? 6 : 5}
                className="px-3 py-2 text-right font-medium"
              >
                Разом:
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {new Intl.NumberFormat("uk-UA", {
                  minimumFractionDigits: 2,
                }).format(total)}{" "}
                ₴
              </td>
              {!readOnly && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 bg-white hover:border-zinc-400"
        >
          + Додати позицію
        </button>
      )}
    </div>
  );
}
