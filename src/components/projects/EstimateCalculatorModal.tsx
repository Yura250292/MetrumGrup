"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Calculator, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  useReferenceEstimates,
  useReferenceEstimate,
  useCreateEstimateFromCalculator,
} from "@/hooks/useReferenceEstimates";
import { scaleReference } from "@/lib/estimates/calculator-scale";

export function EstimateCalculatorModal({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const router = useRouter();
  const { data: references, isLoading: refsLoading } = useReferenceEstimates();
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);
  const { data: refDetail, isLoading: detailLoading } =
    useReferenceEstimate(selectedRefId);
  const [newAreaInput, setNewAreaInput] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const create = useCreateEstimateFromCalculator();

  useEffect(() => {
    if (!open) {
      setSelectedRefId(null);
      setNewAreaInput("");
      setTitle("");
      setExpandedSections(new Set());
      create.reset();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !create.isPending) onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange, create.isPending]);

  const newAreaM2 = useMemo(() => {
    const n = Number(newAreaInput.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [newAreaInput]);

  const scaled = useMemo(() => {
    if (!refDetail || newAreaM2 <= 0) return null;
    try {
      return scaleReference(
        {
          id: refDetail.id,
          title: refDetail.title,
          totalAreaM2: Number(refDetail.totalAreaM2),
          sections: refDetail.sections.map((s) => ({
            id: s.id,
            title: s.title,
            sortOrder: s.sortOrder,
            items: s.items.map((i) => ({
              id: i.id,
              description: i.description,
              unit: i.unit,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
              totalCost: Number(i.totalCost),
              kind: i.kind,
              sortOrder: i.sortOrder,
            })),
          })),
        },
        newAreaM2
      );
    } catch {
      return null;
    }
  }, [refDetail, newAreaM2]);

  if (!open) return null;

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedRefId || newAreaM2 <= 0) return;
    try {
      const result = await create.mutateAsync({
        projectId,
        referenceId: selectedRefId,
        newAreaM2,
        title: title.trim() || undefined,
      });
      onOpenChange(false);
      router.push(`/admin/estimates/${result.data.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const canSave = !!selectedRefId && newAreaM2 > 0 && !!scaled && !create.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => !create.isPending && onOpenChange(false)}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 admin-dark:text-emerald-400 admin-light:text-emerald-600" />
            <h3 className="text-sm font-bold admin-dark:text-white admin-light:text-gray-900">
              Калькулятор кошторису
            </h3>
          </div>
          <button
            onClick={() => !create.isPending && onOpenChange(false)}
            className="rounded-lg p-1 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-2 admin-dark:text-gray-300 admin-light:text-gray-700">
              Еталонний кошторис
            </label>
            {refsLoading && (
              <p className="text-xs admin-dark:text-gray-500 admin-light:text-gray-500">
                Завантаження...
              </p>
            )}
            {!refsLoading && (!references || references.length === 0) && (
              <div className="rounded-lg border border-dashed admin-dark:border-white/10 admin-light:border-gray-300 p-4 text-center">
                <p className="text-xs admin-dark:text-gray-400 admin-light:text-gray-600">
                  Поки немає жодного еталонного кошторису. Створіть його на сторінці{" "}
                  <a
                    href="/admin-v2/reference-estimates"
                    className="underline admin-dark:text-emerald-400 admin-light:text-emerald-600"
                  >
                    Довідкові кошториси
                  </a>
                  .
                </p>
              </div>
            )}
            {references && references.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {references.map((ref) => {
                  const isSelected = selectedRefId === ref.id;
                  return (
                    <button
                      key={ref.id}
                      type="button"
                      onClick={() => setSelectedRefId(ref.id)}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? "admin-dark:border-emerald-400/60 admin-dark:bg-emerald-400/10 admin-light:border-emerald-500 admin-light:bg-emerald-50"
                          : "admin-dark:border-white/10 admin-dark:hover:bg-white/5 admin-light:border-gray-200 admin-light:hover:bg-gray-50"
                      }`}
                    >
                      <p className="text-xs font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
                        {ref.title}
                      </p>
                      <p className="text-[11px] mt-1 admin-dark:text-gray-400 admin-light:text-gray-600">
                        {Number(ref.totalAreaM2).toLocaleString("uk-UA")} м² ·{" "}
                        {formatCurrency(Number(ref.grandTotal))} ·{" "}
                        {ref.itemCount} поз.
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 admin-dark:text-gray-300 admin-light:text-gray-700">
                Нова площа робіт (м²)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={newAreaInput}
                onChange={(e) => setNewAreaInput(e.target.value)}
                placeholder="напр. 120"
                className="w-full rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {refDetail && newAreaM2 > 0 && scaled && (
                <p className="text-[11px] mt-1 admin-dark:text-gray-400 admin-light:text-gray-600">
                  Масштаб: ×{scaled.scaleFactor.toFixed(3)} (від{" "}
                  {Number(refDetail.totalAreaM2).toLocaleString("uk-UA")} м²)
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 admin-dark:text-gray-300 admin-light:text-gray-700">
                Назва (опціонально)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Авто, якщо порожньо"
                className="w-full rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {selectedRefId && detailLoading && (
            <div className="flex items-center gap-2 text-xs admin-dark:text-gray-400 admin-light:text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Завантаження еталона...
            </div>
          )}

          {scaled && (
            <div className="rounded-lg border admin-dark:border-white/10 admin-light:border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 admin-dark:bg-white/5 admin-light:bg-gray-50 border-b admin-dark:border-white/10 admin-light:border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold admin-dark:text-white admin-light:text-gray-900">
                    Превʼю
                  </span>
                  <Badge className="bg-emerald-100 text-emerald-700">
                    ×{scaled.scaleFactor.toFixed(3)}
                  </Badge>
                  <span className="text-[11px] admin-dark:text-gray-400 admin-light:text-gray-600">
                    {scaled.itemCount} поз.
                  </span>
                </div>
                <span className="text-sm font-bold admin-dark:text-emerald-400 admin-light:text-emerald-600">
                  {formatCurrency(scaled.grandTotal)}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {scaled.sections.map((section, idx) => {
                  const id = `${idx}-${section.title}`;
                  const isOpen = expandedSections.has(id);
                  return (
                    <div
                      key={id}
                      className="border-b admin-dark:border-white/5 admin-light:border-gray-100 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(id)}
                        className="w-full flex items-center justify-between px-3 py-2 admin-dark:hover:bg-white/5 admin-light:hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-1">
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          <span className="text-xs font-medium admin-dark:text-gray-200 admin-light:text-gray-800 text-left">
                            {section.title}
                          </span>
                          <span className="text-[10px] admin-dark:text-gray-500 admin-light:text-gray-500">
                            ({section.items.length})
                          </span>
                        </div>
                        <span className="text-xs admin-dark:text-gray-300 admin-light:text-gray-700">
                          {formatCurrency(section.sectionTotal)}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-2">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="admin-dark:text-gray-500 admin-light:text-gray-500">
                                <th className="text-left py-1 font-normal">Опис</th>
                                <th className="text-right py-1 font-normal">К-сть</th>
                                <th className="text-left py-1 pl-1 font-normal">Од.</th>
                                <th className="text-right py-1 font-normal">Ціна</th>
                                <th className="text-right py-1 font-normal">Сума</th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.items.map((item, iIdx) => (
                                <tr
                                  key={iIdx}
                                  className="admin-dark:text-gray-300 admin-light:text-gray-700 border-t admin-dark:border-white/5 admin-light:border-gray-100"
                                >
                                  <td className="py-1 pr-2">{item.description}</td>
                                  <td className="text-right py-1 tabular-nums">
                                    {item.quantity.toLocaleString("uk-UA")}
                                  </td>
                                  <td className="py-1 pl-1">{item.unit}</td>
                                  <td className="text-right py-1 tabular-nums">
                                    {item.unitPrice.toLocaleString("uk-UA")}
                                  </td>
                                  <td className="text-right py-1 tabular-nums">
                                    {formatCurrency(item.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {create.isError && (
            <p className="text-xs text-red-500">
              {(create.error as Error)?.message}
            </p>
          )}
        </div>

        <div className="border-t admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Скасувати
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {create.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Збереження...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4" />
                Зберегти як чернетку
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
