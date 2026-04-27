"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComboboxOption } from "@/components/ui/combobox";
import { useAddEstimateItem } from "@/hooks/useEstimateItems";
import { EditableItemRow, type EditableItem } from "./EditableItemRow";

export function EditableSectionTable({
  estimateId,
  sectionId,
  sectionTitle,
  items,
  costCodeOptions,
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

  return (
    <div className="rounded-lg border admin-dark:border-white/10 admin-light:border-gray-200 overflow-hidden">
      <div className="px-4 py-2 admin-dark:bg-white/5 admin-light:bg-gray-50 border-b admin-dark:border-white/10 admin-light:border-gray-200">
        <h4 className="text-sm font-semibold admin-dark:text-white admin-light:text-gray-900">
          {sectionTitle}
        </h4>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[11px] font-medium uppercase admin-dark:text-gray-500 admin-light:text-gray-500 border-b admin-dark:border-white/5 admin-light:border-gray-100">
            <th className="px-2 py-1.5 text-left">Опис</th>
            <th className="px-2 py-1.5 text-left w-44">Стаття</th>
            <th className="px-2 py-1.5 text-center w-16">Од.</th>
            <th className="px-2 py-1.5 text-right w-24">К-сть</th>
            <th className="px-2 py-1.5 text-right w-28">Ціна</th>
            <th className="px-2 py-1.5 text-right w-32">Сума</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <EditableItemRow
              key={item.id}
              item={item}
              estimateId={estimateId}
              costCodeOptions={options}
              onChanged={onChanged}
            />
          ))}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-4 text-center text-xs admin-dark:text-gray-500 admin-light:text-gray-500"
              >
                Немає позицій
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t admin-dark:border-white/10 admin-light:border-gray-200">
        <Button
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={addItem.isPending}
        >
          <Plus className="h-4 w-4" />
          Додати позицію
        </Button>
      </div>
    </div>
  );
}
