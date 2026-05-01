"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Check, AlertCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { StageRow } from "./stage-table";

const FIELD_LABELS: Record<string, string> = {
  planVolume: "Обсяг (план)",
  factVolume: "Обсяг (факт)",
  planUnitPrice: "Вартість (план)",
  factUnitPrice: "Вартість (факт)",
  planClientUnitPrice: "Замовник (план)",
  factClientUnitPrice: "Замовник (факт)",
};

type DirtyStage = {
  stageId: string;
  fields: string[];
};

type Props = {
  projectId: string;
  open: boolean;
  stages: StageRow[];
  onClose: () => void;
  onPublished: () => void;
};

/**
 * Phase 3 publish dialog: показує які стейджі мають непубліковані зміни,
 * дозволяє опційно додати коментар, і робить атомарний publish через
 * POST /api/admin/projects/{id}/publish-stages-finance.
 *
 * Detalізований diff (old → new) на цей момент рендерить лише імена полів —
 * це дешево і вже відповідає на питання «що саме змінилося». Якщо
 * знадобиться numeric diff, dirty-stages endpoint можна розширити published-snapshot.
 */
export function PublishFinanceDialog({
  projectId,
  open,
  stages,
  onClose,
  onPublished,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<DirtyStage[]>([]);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/projects/${projectId}/dirty-stages`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Не вдалось завантажити dirty-список");
        }
        const json = await res.json();
        if (!cancelled) setDirty(json.data?.dirty ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Помилка");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  if (!open) return null;

  const stageById = new Map(stages.map((s) => [s.id, s]));

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/publish-stages-finance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: comment.trim() || undefined }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка публікації");
      }
      onPublished();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl shadow-2xl"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
            Опублікувати у фінансування
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={publishing}
            className="rounded-lg p-1.5 transition hover:brightness-[0.97]"
            style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12">
              <Loader2
                size={18}
                className="animate-spin"
                style={{ color: T.accentPrimary }}
              />
              <span className="text-[13px]" style={{ color: T.textSecondary }}>
                Завантаження…
              </span>
            </div>
          )}

          {!loading && error && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
              style={{
                backgroundColor: T.dangerSoft ?? "#FEE2E2",
                color: T.danger,
                border: `1px solid ${T.danger}55`,
              }}
            >
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          {!loading && !error && dirty.length === 0 && (
            <div
              className="rounded-xl p-4 text-[12.5px]"
              style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
            >
              Немає непублікованих змін. Усі етапи синхронізовано з фінансуванням.
            </div>
          )}

          {!loading && !error && dirty.length > 0 && (
            <>
              <p
                className="mb-3 text-[12px]"
                style={{ color: T.textSecondary }}
              >
                {dirty.length}{" "}
                {dirty.length === 1
                  ? "етап"
                  : dirty.length < 5
                    ? "етапи"
                    : "етапів"}{" "}
                буде опубліковано — STAGE_AUTO записи у фінансовому журналі
                перерахуються відповідно до поточних planVolume/planUnitPrice/
                factVolume/... Після цього звіти відображатимуть нові цифри.
              </p>
              <div className="flex flex-col gap-2">
                {dirty.map((d) => {
                  const stage = stageById.get(d.stageId);
                  const name =
                    stage?.customName ??
                    stage?.stage ??
                    d.stageId.slice(0, 8);
                  return (
                    <div
                      key={d.stageId}
                      className="rounded-xl p-3"
                      style={{
                        backgroundColor: T.panelElevated,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <div
                        className="text-[12.5px] font-semibold"
                        style={{ color: T.textPrimary }}
                      >
                        {name}
                      </div>
                      <div
                        className="mt-1 flex flex-wrap gap-1.5"
                      >
                        {d.fields.map((f) => (
                          <span
                            key={f}
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                            style={{
                              backgroundColor: T.warningSoft,
                              color: T.warning,
                            }}
                          >
                            {FIELD_LABELS[f] ?? f}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <label
                className="mt-4 block text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                Коментар (необов&apos;язково)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Напр.: «оновлено ціну керівних робіт після зустрічі з підрядником»"
                className="mt-1 w-full rounded-lg px-3 py-2 text-[12.5px] outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-4"
          style={{ borderTop: `1px solid ${T.borderSoft}` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={publishing}
            className="rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.97]"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={publishing || loading || dirty.length === 0}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-50"
            style={{ backgroundColor: T.success }}
          >
            {publishing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {publishing
              ? "Публікую…"
              : `Опублікувати ${dirty.length || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
