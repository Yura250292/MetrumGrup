"use client";

import { useState } from "react";
import { Plus, Trash2, FileSpreadsheet, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import {
  useReferenceEstimates,
  useDeleteReferenceEstimate,
} from "@/hooks/useReferenceEstimates";
import { ReferenceUploadModal } from "./reference-upload-modal";

export function ReferenceEstimatesClient() {
  const { data: references, isLoading, error } = useReferenceEstimates();
  const del = useDeleteReferenceEstimate();
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Видалити еталон "${title}"?`)) return;
    try {
      await del.mutateAsync(id);
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  };

  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet size={18} style={{ color: T.accentPrimary }} />
          <span className="text-base font-bold" style={{ color: T.textPrimary }}>
            Еталонні кошториси
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
          >
            {references?.length ?? 0}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={14} /> Завантажити XLSX
        </button>
      </div>

      <div className="px-6 py-4">
        {isLoading && (
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: T.textSecondary }}
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Завантаження...
          </div>
        )}
        {error && (
          <p className="text-sm" style={{ color: T.danger }}>
            Помилка: {(error as Error).message}
          </p>
        )}
        {!isLoading && (!references || references.length === 0) && (
          <div
            className="rounded-xl border border-dashed py-10 px-4 text-center"
            style={{ borderColor: T.borderStrong, color: T.textMuted }}
          >
            Поки немає жодного еталону. Завантажте перший XLSX, щоб калькулятор
            запрацював.
          </div>
        )}
        {references && references.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-[11px] uppercase tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  <th className="py-2 pr-4">Назва</th>
                  <th className="py-2 pr-4">Площа</th>
                  <th className="py-2 pr-4">Сума</th>
                  <th className="py-2 pr-4">Позицій</th>
                  <th className="py-2 pr-4">Створено</th>
                  <th className="py-2 pr-4 text-right">Дії</th>
                </tr>
              </thead>
              <tbody>
                {references.map((ref) => (
                  <tr
                    key={ref.id}
                    className="border-t"
                    style={{ borderColor: T.borderSoft, color: T.textPrimary }}
                  >
                    <td className="py-3 pr-4">
                      <div className="font-semibold">{ref.title}</div>
                      {ref.description && (
                        <div
                          className="text-[11px] mt-0.5"
                          style={{ color: T.textMuted }}
                        >
                          {ref.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {Number(ref.totalAreaM2).toLocaleString("uk-UA")} м²
                    </td>
                    <td
                      className="py-3 pr-4 tabular-nums font-semibold"
                      style={{ color: T.success }}
                    >
                      {formatCurrency(Number(ref.grandTotal))}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{ref.itemCount}</td>
                    <td className="py-3 pr-4 text-[11px]" style={{ color: T.textMuted }}>
                      {new Date(ref.createdAt).toLocaleDateString("uk-UA")}
                      {ref.createdBy?.name && ` · ${ref.createdBy.name}`}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(ref.id, ref.title)}
                        disabled={del.isPending}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition hover:brightness-[0.97]"
                        style={{
                          backgroundColor: T.dangerSoft,
                          color: T.danger,
                        }}
                      >
                        <Trash2 size={12} /> Видалити
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReferenceUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </section>
  );
}
