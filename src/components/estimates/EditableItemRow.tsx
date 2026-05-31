"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import {
  useDeleteEstimateItem,
  useUpdateEstimateItem,
  type EstimateItemCostType,
} from "@/hooks/useEstimateItems";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

export type EditableItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** Собівартість (для фірми). Якщо null — fallback на unitPrice. */
  unitCost: number | null;
  /** Ціна для замовника. Якщо null — fallback на unitPrice × 1.2. */
  unitPriceCustomer: number | null;
  /** Виконроб (FK → User). Можна null. */
  foremanId: string | null;
  foreman: { id: string; name: string | null } | null;
  /** Виконавець (free-form). */
  executorText: string | null;
  amount: number;
  costCodeId: string | null;
  costCode: { id: string; code: string; name: string } | null;
  /** Планувальні поля (для Estimate → Task sync). */
  plannedStart?: string | null;
  plannedDurationDays?: number | null;
  predecessorItemId?: string | null;
  dependencyType?: "FS" | "SS" | "FF" | "SF" | null;
  dependencyLagDays?: number;
};

export type ForemanOption = { id: string; name: string };

export type PredecessorOption = { id: string; label: string };

const DEP_TYPE_OPTIONS: { value: "FS" | "SS" | "FF" | "SF"; label: string }[] = [
  { value: "FS", label: "FS (після завершення)" },
  { value: "SS", label: "SS (одночасно зі стартом)" },
  { value: "FF", label: "FF (одночасне завершення)" },
  { value: "SF", label: "SF (від старту до кінця)" },
];

export function EditableItemRow({
  item,
  estimateId,
  costCodeOptions,
  foremanOptions = [],
  predecessorOptions = [],
  locked = false,
  onChanged,
}: {
  item: EditableItem;
  estimateId: string;
  costCodeOptions: ComboboxOption[];
  /** Список потенційних виконробів (для select). */
  foremanOptions?: ForemanOption[];
  /** Інші позиції у тому ж кошторисі — для вибору попередника. */
  predecessorOptions?: PredecessorOption[];
  /** Версія заморожена — поля read-only. */
  locked?: boolean;
  onChanged?: () => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [unit, setUnit] = useState(item.unit);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice));
  const initialCost = item.unitCost ?? item.unitPrice;
  const initialCustomer = item.unitPriceCustomer ?? initialCost * 1.2;
  const [unitCost, setUnitCost] = useState(String(initialCost));
  const [unitPriceCustomer, setUnitPriceCustomer] = useState(String(initialCustomer));
  const [executorText, setExecutorText] = useState(item.executorText ?? "");
  const [expanded, setExpanded] = useState(false);
  const [plannedStart, setPlannedStart] = useState(item.plannedStart?.slice(0, 10) ?? "");
  const [plannedDuration, setPlannedDuration] = useState(
    item.plannedDurationDays != null ? String(item.plannedDurationDays) : "",
  );
  const [dependencyLag, setDependencyLag] = useState(
    item.dependencyLagDays != null ? String(item.dependencyLagDays) : "0",
  );

  const updateItem = useUpdateEstimateItem(estimateId);
  const deleteItem = useDeleteEstimateItem(estimateId);

  // Sync state if item changed externally (e.g. after save)
  useEffect(() => {
    setDescription(item.description);
    setUnit(item.unit);
    setQuantity(String(item.quantity));
    setUnitPrice(String(item.unitPrice));
    setUnitCost(String(item.unitCost ?? item.unitPrice));
    setUnitPriceCustomer(
      String(item.unitPriceCustomer ?? (item.unitCost ?? item.unitPrice) * 1.2),
    );
    setExecutorText(item.executorText ?? "");
    setPlannedStart(item.plannedStart?.slice(0, 10) ?? "");
    setPlannedDuration(
      item.plannedDurationDays != null ? String(item.plannedDurationDays) : "",
    );
    setDependencyLag(item.dependencyLagDays != null ? String(item.dependencyLagDays) : "0");
  }, [
    item.id,
    item.description,
    item.unit,
    item.quantity,
    item.unitPrice,
    item.unitCost,
    item.unitPriceCustomer,
    item.executorText,
    item.plannedStart,
    item.plannedDurationDays,
    item.dependencyLagDays,
  ]);

  const costNum = Number(unitCost) || 0;
  const customerNum = Number(unitPriceCustomer) || 0;
  const marginPct = costNum > 0 ? ((customerNum - costNum) / costNum) * 100 : 0;
  const computedAmount = (Number(quantity) || 0) * costNum;

  const handleSave = async (patch: {
    description?: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
    unitCost?: number | null;
    unitPriceCustomer?: number | null;
    foremanId?: string | null;
    executorText?: string | null;
    costCodeId?: string | null;
    costType?: EstimateItemCostType | null;
    plannedStart?: string | null;
    plannedDurationDays?: number | null;
    predecessorItemId?: string | null;
    dependencyType?: "FS" | "SS" | "FF" | "SF" | null;
    dependencyLagDays?: number;
  }) => {
    try {
      await updateItem.mutateAsync({ itemId: item.id, patch });
      onChanged?.();
    } catch (err) {
      console.error("Failed to update item:", err);
    }
  };

  // The current cost-code may be filtered out of the options list (inactive,
  // not yet loaded). Make sure it's still selectable so the row shows it.
  const optionsWithCurrent =
    item.costCode &&
    !costCodeOptions.some((o) => o.value === item.costCode!.id)
      ? [
          {
            value: item.costCode.id,
            label: `${item.costCode.code} ${item.costCode.name}`,
          },
          ...costCodeOptions,
        ]
      : costCodeOptions;

  const handleDelete = async () => {
    if (!confirm(`Видалити позицію "${item.description}"?`)) return;
    try {
      await deleteItem.mutateAsync(item.id);
      onChanged?.();
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  // Inputs read-only при locked. Spread на element через disabled.
  const inputCls = (extra: string) =>
    `w-full rounded px-2 py-1 text-sm bg-transparent admin-dark:text-white admin-light:text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white admin-dark:focus:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed ${extra}`;

  return (
    <>
      <tr className="border-b admin-dark:border-white/5 admin-light:border-gray-100 group">
        <td className="px-2 py-1.5">
          <input
            type="text"
            value={description}
            disabled={locked}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== item.description) handleSave({ description });
            }}
            className={inputCls("")}
          />
        </td>
        <td className="px-2 py-1.5 w-44">
          <Combobox
            value={item.costCodeId}
            options={optionsWithCurrent}
            disabled={locked}
            onChange={(value) => {
              if (value === item.costCodeId) return;
              handleSave({ costCodeId: value });
            }}
            placeholder="Без статті"
            searchPlaceholder="Пошук статті…"
            emptyMessage="Нічого не знайдено"
            listMaxHeight={300}
          />
        </td>
        <td className="px-2 py-1.5 w-16">
          <input
            type="text"
            value={unit}
            disabled={locked}
            onChange={(e) => setUnit(e.target.value)}
            onBlur={() => {
              if (unit !== item.unit) handleSave({ unit });
            }}
            className={inputCls("text-center")}
          />
        </td>
        <td className="px-2 py-1.5 w-24">
          <input
            type="number"
            step="0.001"
            min="0"
            value={quantity}
            disabled={locked}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={() => {
              const q = Number(quantity);
              if (Number.isFinite(q) && q !== item.quantity) handleSave({ quantity: q });
            }}
            className={inputCls("text-right")}
          />
        </td>
        <td className="px-2 py-1.5 w-28" title="Собівартість (плановий cost для фірми)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={unitCost}
            disabled={locked}
            onChange={(e) => setUnitCost(e.target.value)}
            onBlur={() => {
              const v = Number(unitCost);
              if (Number.isFinite(v) && v !== (item.unitCost ?? item.unitPrice)) {
                handleSave({ unitCost: v, unitPrice: v });
              }
            }}
            className={inputCls("text-right")}
          />
        </td>
        <td className="px-2 py-1.5 w-28" title="Ціна для замовника (план)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={unitPriceCustomer}
            disabled={locked}
            onChange={(e) => setUnitPriceCustomer(e.target.value)}
            onBlur={() => {
              const v = Number(unitPriceCustomer);
              const current = item.unitPriceCustomer ?? (item.unitCost ?? item.unitPrice) * 1.2;
              if (Number.isFinite(v) && Math.abs(v - current) > 0.005) {
                handleSave({ unitPriceCustomer: v });
              }
            }}
            className={inputCls("text-right")}
          />
        </td>
        <td
          className="px-2 py-1.5 w-16 text-right text-xs"
          style={{ color: marginPct >= 0 ? "rgb(16,185,129)" : "rgb(239,68,68)" }}
          title="Маржа = (Замовнику − Собівартість) / Собівартість × 100"
        >
          {marginPct.toFixed(0)}%
        </td>
        <td className="px-2 py-1.5 w-32 text-right text-sm font-semibold admin-dark:text-emerald-400 admin-light:text-emerald-600">
          {computedAmount.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-2 py-1.5 w-10 text-right">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-[10px] admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
            title={expanded ? "Сховати деталі" : "Виконроб / виконавець"}
          >
            {expanded ? "▾" : "▸"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={locked || deleteItem.isPending}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            title={locked ? "Версія заморожена" : "Видалити"}
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="admin-dark:bg-white/[0.03] admin-light:bg-gray-50/50">
          <td colSpan={9} className="px-4 py-2">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2">
                <span className="admin-dark:text-gray-400 admin-light:text-gray-600">Виконроб:</span>
                <select
                  value={item.foremanId ?? ""}
                  disabled={locked}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    if (v === item.foremanId) return;
                    handleSave({ foremanId: v });
                  }}
                  className="rounded border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-white/5 admin-light:bg-white px-2 py-1 text-xs disabled:opacity-60"
                >
                  <option value="">— з етапу —</option>
                  {item.foreman && !foremanOptions.some((f) => f.id === item.foreman!.id) && (
                    <option value={item.foreman.id}>
                      {item.foreman.name ?? item.foreman.id}
                    </option>
                  )}
                  {foremanOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 flex-1 min-w-[160px]">
                <span className="admin-dark:text-gray-400 admin-light:text-gray-600">Виконавець:</span>
                <input
                  type="text"
                  value={executorText}
                  disabled={locked}
                  placeholder="бригада або майстер"
                  onChange={(e) => setExecutorText(e.target.value)}
                  onBlur={() => {
                    if ((executorText || null) !== item.executorText) {
                      handleSave({ executorText: executorText.trim() || null });
                    }
                  }}
                  className="flex-1 rounded border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-white/5 admin-light:bg-white px-2 py-1 text-xs disabled:opacity-60"
                />
              </label>
            </div>
            <div className="mt-2 pt-2 border-t admin-dark:border-white/5 admin-light:border-gray-200 flex flex-wrap items-center gap-3 text-xs">
              <div className="font-medium admin-dark:text-gray-300 admin-light:text-gray-700">
                Планування:
              </div>
              <label className="flex items-center gap-2">
                <span className="admin-dark:text-gray-400 admin-light:text-gray-600">Початок:</span>
                <input
                  type="date"
                  value={plannedStart}
                  disabled={locked}
                  onChange={(e) => setPlannedStart(e.target.value)}
                  onBlur={() => {
                    const next = plannedStart || null;
                    const prev = item.plannedStart?.slice(0, 10) ?? null;
                    if (next !== prev) {
                      handleSave({
                        plannedStart: next ? new Date(next).toISOString() : null,
                      });
                    }
                  }}
                  className="rounded border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-white/5 admin-light:bg-white px-2 py-1 text-xs disabled:opacity-60"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="admin-dark:text-gray-400 admin-light:text-gray-600">Днів:</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={plannedDuration}
                  disabled={locked}
                  placeholder="—"
                  onChange={(e) => setPlannedDuration(e.target.value)}
                  onBlur={() => {
                    const raw = plannedDuration.trim();
                    const next = raw === "" ? null : Number(raw);
                    const prev = item.plannedDurationDays ?? null;
                    if (next !== prev && (next === null || Number.isInteger(next))) {
                      handleSave({ plannedDurationDays: next });
                    }
                  }}
                  className="w-16 rounded border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-white/5 admin-light:bg-white px-2 py-1 text-xs text-right disabled:opacity-60"
                />
              </label>
              <label className="flex items-center gap-2 flex-1 min-w-[180px]">
                <span className="admin-dark:text-gray-400 admin-light:text-gray-600">Попередник:</span>
                <select
                  value={item.predecessorItemId ?? ""}
                  disabled={locked}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    if (v === (item.predecessorItemId ?? null)) return;
                    handleSave({ predecessorItemId: v });
                  }}
                  className="flex-1 rounded border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-white/5 admin-light:bg-white px-2 py-1 text-xs disabled:opacity-60"
                >
                  <option value="">— нема —</option>
                  {predecessorOptions
                    .filter((o) => o.id !== item.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="admin-dark:text-gray-400 admin-light:text-gray-600">Тип:</span>
                <select
                  value={item.dependencyType ?? "FS"}
                  disabled={locked || !item.predecessorItemId}
                  onChange={(e) => {
                    const v = e.target.value as "FS" | "SS" | "FF" | "SF";
                    if (v === (item.dependencyType ?? "FS")) return;
                    handleSave({ dependencyType: v });
                  }}
                  className="rounded border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-white/5 admin-light:bg-white px-2 py-1 text-xs disabled:opacity-60"
                >
                  {DEP_TYPE_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="admin-dark:text-gray-400 admin-light:text-gray-600">Лаг (дн):</span>
                <input
                  type="number"
                  step="1"
                  value={dependencyLag}
                  disabled={locked || !item.predecessorItemId}
                  onChange={(e) => setDependencyLag(e.target.value)}
                  onBlur={() => {
                    const n = Number(dependencyLag);
                    if (!Number.isInteger(n)) return;
                    if (n !== (item.dependencyLagDays ?? 0)) {
                      handleSave({ dependencyLagDays: n });
                    }
                  }}
                  className="w-16 rounded border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-white/5 admin-light:bg-white px-2 py-1 text-xs text-right disabled:opacity-60"
                />
              </label>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
