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
  amount: number;
  costCodeId: string | null;
  costCode: { id: string; code: string; name: string } | null;
};

export function EditableItemRow({
  item,
  estimateId,
  costCodeOptions,
  onChanged,
}: {
  item: EditableItem;
  estimateId: string;
  costCodeOptions: ComboboxOption[];
  onChanged?: () => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [unit, setUnit] = useState(item.unit);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice));

  const updateItem = useUpdateEstimateItem(estimateId);
  const deleteItem = useDeleteEstimateItem(estimateId);

  // Sync state if item changed externally (e.g. after save)
  useEffect(() => {
    setDescription(item.description);
    setUnit(item.unit);
    setQuantity(String(item.quantity));
    setUnitPrice(String(item.unitPrice));
  }, [item.id, item.description, item.unit, item.quantity, item.unitPrice]);

  const computedAmount = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  const handleSave = async (patch: {
    description?: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
    costCodeId?: string | null;
    costType?: EstimateItemCostType | null;
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

  return (
    <tr className="border-b admin-dark:border-white/5 admin-light:border-gray-100 group">
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== item.description) handleSave({ description });
          }}
          className="w-full rounded px-2 py-1 text-sm bg-transparent admin-dark:text-white admin-light:text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white admin-dark:focus:bg-gray-900"
        />
      </td>
      <td className="px-2 py-1.5 w-44">
        <Combobox
          value={item.costCodeId}
          options={optionsWithCurrent}
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
          onChange={(e) => setUnit(e.target.value)}
          onBlur={() => {
            if (unit !== item.unit) handleSave({ unit });
          }}
          className="w-full rounded px-2 py-1 text-sm text-center bg-transparent admin-dark:text-white admin-light:text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white admin-dark:focus:bg-gray-900"
        />
      </td>
      <td className="px-2 py-1.5 w-24">
        <input
          type="number"
          step="0.001"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onBlur={() => {
            const q = Number(quantity);
            if (Number.isFinite(q) && q !== item.quantity) handleSave({ quantity: q });
          }}
          className="w-full rounded px-2 py-1 text-sm text-right bg-transparent admin-dark:text-white admin-light:text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white admin-dark:focus:bg-gray-900"
        />
      </td>
      <td className="px-2 py-1.5 w-28">
        <input
          type="number"
          step="0.01"
          min="0"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          onBlur={() => {
            const p = Number(unitPrice);
            if (Number.isFinite(p) && p !== item.unitPrice) handleSave({ unitPrice: p });
          }}
          className="w-full rounded px-2 py-1 text-sm text-right bg-transparent admin-dark:text-white admin-light:text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white admin-dark:focus:bg-gray-900"
        />
      </td>
      <td className="px-2 py-1.5 w-32 text-right text-sm font-semibold admin-dark:text-emerald-400 admin-light:text-emerald-600">
        {computedAmount.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td className="px-2 py-1.5 w-10 text-right">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteItem.isPending}
          className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
          title="Видалити"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </button>
      </td>
    </tr>
  );
}
