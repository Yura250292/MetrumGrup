"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComboboxOption } from "@/components/ui/combobox";
import { useAddEstimateItem } from "@/hooks/useEstimateItems";
import {
  EditableItemRow,
  type EditableItem,
  type ForemanOption,
  type PredecessorOption,
} from "./EditableItemRow";

export function EditableSectionTable({
  estimateId,
  sectionId,
  sectionTitle,
  items,
  costCodeOptions,
  foremanOptions = [],
  predecessorOptions = [],
  locked = false,
  onChanged,
}: {
  estimateId: string;
  sectionId: string;
  sectionTitle: string;
  items: EditableItem[];
  /**
   * Cost-code options to render in each row's combobox. Optional — if not
   * provided, the table fetches them itself once. Pass it from the parent
   * when rendering many tables on one screen to avoid N parallel fetches.
   */
  costCodeOptions?: ComboboxOption[];
  /** Список потенційних виконробів (MANAGER + FOREMAN). */
  foremanOptions?: ForemanOption[];
  /** Інші позиції у всьому кошторисі (для select-предка в розгорнутій формі). */
  predecessorOptions?: PredecessorOption[];
  /** Версія кошторису заморожена — UI блокує редагування. */
  locked?: boolean;
  onChanged?: () => void;
}) {
  const addItem = useAddEstimateItem(estimateId);
  const [localOptions, setLocalOptions] = useState<ComboboxOption[]>([]);
  const options = costCodeOptions ?? localOptions;

  useEffect(() => {
    if (costCodeOptions) return;
    let cancelled = false;
    fetch("/api/admin/financing/cost-codes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        if (cancelled) return;
        setLocalOptions(
          (j.data ?? []).map((c: { id: string; code: string; name: string; depth: number }) => ({
            value: c.id,
            label: `${c.code} ${c.name}`,
            description: c.depth === 0 ? "розділ" : undefined,
          })),
        );
      })
      .catch(() => {
        /* empty list — combobox stays usable but offers no choices */
      });
    return () => {
      cancelled = true;
    };
  }, [costCodeOptions]);

  const handleAdd = async () => {
    try {
      await addItem.mutateAsync({
        sectionId,
        description: "Нова позиція",
        unit: "шт",
        quantity: 1,
        unitPrice: 0,
      });
      onChanged?.();
    } catch (err) {
      console.error("Failed to add item:", err);
    }
  };

  // Section totals — sum quantity * unitCost (план для фірми) + sum
  // quantity * unitPriceCustomer (план для замовника). Margin agg = різниця.
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalCost = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitCost ?? it.unitPrice) || 0),
    0,
  );
  const totalCustomer = items.reduce(
    (s, it) =>
      s + (Number(it.quantity) || 0) * (Number(it.unitPriceCustomer ?? (it.unitCost ?? it.unitPrice) * 1.2) || 0),
    0,
  );
  const totalMargin = totalCost > 0 ? ((totalCustomer - totalCost) / totalCost) * 100 : 0;

  const fmt = (n: number) =>
    n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border admin-dark:border-white/10 admin-light:border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 admin-dark:bg-white/5 admin-light:bg-gray-50 border-b admin-dark:border-white/10 admin-light:border-gray-200">
        <h4 className="text-[13px] font-semibold admin-dark:text-white admin-light:text-gray-900">
          {sectionTitle}
        </h4>
        <span className="text-[10px] tabular-nums admin-dark:text-gray-400 admin-light:text-gray-500">
          {items.length} {items.length === 1 ? "позиція" : items.length < 5 ? "позиції" : "позицій"}
        </span>
      </div>
      <table className="w-full text-[12px]">
        <thead className="admin-dark:bg-white/[0.02] admin-light:bg-gray-50/40">
          <tr className="text-[10px] font-bold uppercase tracking-wider admin-dark:text-gray-400 admin-light:text-gray-500 border-b admin-dark:border-white/5 admin-light:border-gray-100">
            <th className="px-2 py-1 text-left">Опис</th>
            <th className="px-1.5 py-1 text-left w-40">Стаття</th>
            <th className="px-1.5 py-1 text-center w-12" title="Одиниця виміру">Од.</th>
            <th className="px-1.5 py-1 text-right w-20" title="Обʼєм (кількість)">Обʼєм</th>
            <th className="px-1.5 py-1 text-right w-24" title="Собівартість за одиницю">Cost</th>
            <th className="px-1.5 py-1 text-right w-24" title="Ціна для замовника за одиницю">Замовнику</th>
            <th className="px-1.5 py-1 text-right w-14" title="Маржа за позицією">Маржа</th>
            <th className="px-1.5 py-1 text-right w-28">Сума</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <EditableItemRow
              key={item.id}
              item={item}
              estimateId={estimateId}
              costCodeOptions={options}
              foremanOptions={foremanOptions}
              predecessorOptions={predecessorOptions}
              locked={locked}
              onChanged={onChanged}
            />
          ))}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={9}
                className="px-3 py-3 text-center text-xs admin-dark:text-gray-500 admin-light:text-gray-500"
              >
                Немає позицій
              </td>
            </tr>
          )}
        </tbody>
        {items.length > 0 && (
          <tfoot className="border-t-2 admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-white/[0.04] admin-light:bg-gray-50/70">
            <tr className="text-[11px] font-bold">
              <td
                className="px-2 py-1.5 text-right uppercase tracking-wider text-[10px] admin-dark:text-gray-400 admin-light:text-gray-600"
                colSpan={3}
              >
                Разом:
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums admin-dark:text-gray-200 admin-light:text-gray-800">
                {fmt(totalQty)}
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums admin-dark:text-gray-300 admin-light:text-gray-700">
                {fmt(totalCost)}
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums admin-dark:text-gray-300 admin-light:text-gray-700">
                {fmt(totalCustomer)}
              </td>
              <td
                className="px-1.5 py-1.5 text-right tabular-nums"
                style={{ color: totalMargin >= 0 ? "rgb(16,185,129)" : "rgb(239,68,68)" }}
              >
                {totalMargin.toFixed(0)}%
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums admin-dark:text-emerald-400 admin-light:text-emerald-600">
                {fmt(totalCost)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
      <div className="px-3 py-1.5 border-t admin-dark:border-white/10 admin-light:border-gray-200">
        <Button
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={locked || addItem.isPending}
          title={locked ? "Версія кошторису заморожена" : ""}
        >
          <Plus className="h-3.5 w-3.5" />
          Додати позицію
        </Button>
      </div>
    </div>
  );
}
