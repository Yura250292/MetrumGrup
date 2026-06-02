"use client";

import { useEffect, useState } from "react";
import { X, FileText, Loader2, Check, ArrowDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type EstimateRow = {
  id: string;
  number: string;
  title: string;
  status: string;
  role: string;
  finalAmount: number;
  finalClientPrice: number;
  sections: number;
  items: number;
  syncedAt: Date | string | null;
};

type ImportEstimateModalProps = {
  projectId: string;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

/**
 * Модалка вибору кошторису для liftу у дерево стейджів.
 *
 * Кожна `EstimateSection` стане top-level стейджем; items під нею — child-стейджі
 * з planVolume / unit / planUnitPrice / planClientUnitPrice. Re-import оновлює
 * існуючі стейджі (по source-FK), не створюючи дублікатів. Ручні зміни
 * factVolume / status / responsible НЕ перезаписуються.
 */
export function ImportEstimateModal({
  projectId,
  onClose,
  onImported,
}: ImportEstimateModalProps) {
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [result, setResult] = useState<{
    title: string;
    sectionsCreated: number;
    sectionsUpdated: number;
    itemsCreated: number;
    itemsUpdated: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/projects/${projectId}/import-estimate`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const json = (await res.json()) as { data: EstimateRow[] };
          setEstimates(json.data ?? []);
        }
      } catch (err) {
        console.error("[import-estimate-modal] load failed", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function importOne(estimate: EstimateRow) {
    setImporting(estimate.id);
    setResult(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/import-estimate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estimateId: estimate.id }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка імпорту");
      }
      const json = (await res.json()) as {
        data: {
          sectionsCreated: number;
          sectionsUpdated: number;
          itemsCreated: number;
          itemsUpdated: number;
        };
      };
      setResult({
        title: estimate.title,
        sectionsCreated: json.data.sectionsCreated,
        sectionsUpdated: json.data.sectionsUpdated,
        itemsCreated: json.data.itemsCreated,
        itemsUpdated: json.data.itemsUpdated,
      });
      await onImported();
    } catch (err) {
      console.error("[import-estimate-modal] import failed", err);
      alert(err instanceof Error ? err.message : "Помилка імпорту");
    } finally {
      setImporting(null);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex max-h-[80vh] w-full max-w-[680px] flex-col rounded-2xl shadow-2xl"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-start justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: T.borderSoft }}
          >
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
                <FileText size={12} />
                Імпорт у етапи
              </div>
              <h3 className="mt-1 text-[16px] font-bold" style={{ color: T.textPrimary }}>
                Виберіть кошторис
              </h3>
              <p className="mt-1 text-[12px]" style={{ color: T.textSecondary }}>
                Розділи кошторису стануть етапами, позиції — підетапами.
                Обсяг × вартість одразу попадуть у фінансування.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:brightness-95"
              style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              aria-label="Закрити"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {result && (
              <div
                className="mb-4 rounded-lg border p-3 text-[12px]"
                style={{
                  backgroundColor: T.successSoft,
                  borderColor: T.success + "55",
                  color: T.textPrimary,
                }}
              >
                <div className="mb-1 flex items-center gap-1.5 font-semibold" style={{ color: T.success }}>
                  <Check size={13} />
                  Імпортовано «{result.title}»
                </div>
                <div style={{ color: T.textSecondary }}>
                  Розділів створено: <b>{result.sectionsCreated}</b>, оновлено:{" "}
                  <b>{result.sectionsUpdated}</b>. Позицій створено:{" "}
                  <b>{result.itemsCreated}</b>, оновлено: <b>{result.itemsUpdated}</b>.
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-10 text-[12px]" style={{ color: T.textMuted }}>
                <Loader2 size={14} className="mr-2 animate-spin" />
                Завантаження…
              </div>
            ) : estimates.length === 0 ? (
              <div
                className="rounded-lg border border-dashed p-6 text-center text-[12px]"
                style={{ borderColor: T.borderSoft, color: T.textMuted }}
              >
                У проєкті ще немає кошторисів. Створіть кошторис у вкладці «Кошториси».
              </div>
            ) : (
              <ul className="space-y-2">
                {estimates.map((est) => {
                  const isImporting = importing === est.id;
                  const isSynced = !!est.syncedAt;
                  return (
                    <li
                      key={est.id}
                      className="rounded-lg border px-3 py-2"
                      style={{
                        borderColor: T.borderSoft,
                        backgroundColor: T.panelSoft,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div
                            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: T.textMuted }}
                          >
                            <span>{est.number}</span>
                            <span>·</span>
                            <span>{est.role}</span>
                            <span>·</span>
                            <span>{est.status}</span>
                            {isSynced && (
                              <span style={{ color: T.success }}>· синхронізовано</span>
                            )}
                          </div>
                          <div
                            className="mt-1 truncate text-[13px] font-semibold"
                            style={{ color: T.textPrimary }}
                            title={est.title}
                          >
                            {est.title}
                          </div>
                          <div className="mt-1 text-[11px]" style={{ color: T.textSecondary }}>
                            Розділів: <b>{est.sections}</b> · Позицій: <b>{est.items}</b> ·{" "}
                            Сума: <b>{formatCurrency(est.finalAmount)}</b>
                            {est.finalClientPrice > 0 && (
                              <>
                                {" · "}
                                Клієнту:{" "}
                                <b style={{ color: T.success }}>
                                  {formatCurrency(est.finalClientPrice)}
                                </b>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => importOne(est)}
                          disabled={isImporting || importing !== null}
                          className="flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50"
                          style={{
                            backgroundColor: T.accentPrimary,
                            color: "white",
                          }}
                        >
                          {isImporting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <ArrowDown size={12} />
                          )}
                          {isSynced ? "Оновити" : "Імпортувати"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end border-t px-5 py-3"
            style={{ borderColor: T.borderSoft }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-[12px] font-medium transition"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textSecondary,
              }}
            >
              Закрити
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
