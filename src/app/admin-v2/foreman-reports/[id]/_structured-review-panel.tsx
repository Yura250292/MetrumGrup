"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, FilePlus2, Info, Loader2 } from "lucide-react";

type SectionLite = { id: string; title: string } | null;
type EstimateItemLite = {
  id: string;
  description: string;
  unit: string;
  section?: SectionLite;
} | null;

type ProgressRow = {
  id: string;
  quantityActual: string;
  unitSnapshot: string | null;
  quantityPlannedSnapshot: string | null;
  estimateItem: (EstimateItemLite & { quantity?: string }) | null;
};

type ItemRow = {
  id: string;
  itemType: string;
  title: string;
  nameOverride: string | null;
  unit: string | null;
  unitOverride: string | null;
  quantity: string | null;
  pmDecision: "PENDING" | "LINKED" | "NEW_ITEM" | "INFO_ONLY" | null;
  estimateItemId: string | null;
  linkedEstimateItemId: string | null;
  linkedEstimateItem: EstimateItemLite;
};

/**
 * P7/P10: панель structured-review звіту виконроба для ПМ.
 * Показує виконані обсяги (progress) і додаткові роботи (EXTRA) з рішеннями
 * LINKED / NEW_ITEM(ДКО) / INFO_ONLY. Самодостатня — фетчить власні дані.
 */
export function StructuredReviewPanel({
  id,
  canDecide,
}: {
  id: string;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [extras, setExtras] = useState<ItemRow[]>([]);
  const [linkTargets, setLinkTargets] = useState<{ id: string; label: string }[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRevision, setShowRevision] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/admin/foreman-reports/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const { report } = await r.json();
    const prog: ProgressRow[] = report.progress ?? [];
    setProgress(prog);
    setExtras((report.items ?? []).filter((it: ItemRow) => it.itemType === "EXTRA"));
    // Цілі для LINKED — роботи з progress цього звіту (типовий кейс).
    const targets = prog
      .filter((p) => p.estimateItem)
      .map((p) => ({
        id: p.estimateItem!.id,
        label: `${p.estimateItem!.description} (${p.estimateItem!.unit})`,
      }));
    setLinkTargets(targets);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function decide(itemId: string, body: Record<string, unknown>) {
    setBusyId(itemId);
    setError(null);
    try {
      const r = await fetch(`/api/admin/foreman-reports/${id}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.message ?? "Помилка рішення");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusyId(null);
    }
  }

  async function toChangeOrder(itemId: string) {
    setBusyId(itemId);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/foreman-reports/${id}/items/${itemId}/to-change-order`,
        { method: "POST" },
      );
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.message ?? "Не вдалося створити ДКО");
      await load();
      if (d?.data?.id) router.push(`/admin-v2/change-orders/${d.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusyId(null);
    }
  }

  async function sendRevision() {
    if (revisionNotes.trim().length < 3) return;
    setBusyId("revision");
    try {
      const r = await fetch(`/api/admin/foreman-reports/${id}/needs-revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: revisionNotes.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.message ?? "Помилка");
      }
      router.refresh();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusyId(null);
    }
  }

  if (progress.length === 0 && extras.length === 0) return null;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 mb-4 space-y-5">
      {error && <div className="text-sm text-rose-300">{error}</div>}

      {progress.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">
            Виконані обсяги (з кошторису)
          </div>
          <div className="space-y-2">
            {progress.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2 text-sm"
              >
                <div className="text-zinc-200">
                  {p.estimateItem?.description ?? "—"}
                  {p.estimateItem?.section?.title && (
                    <span className="text-zinc-500"> · {p.estimateItem.section.title}</span>
                  )}
                </div>
                <div className="text-zinc-300 font-medium">
                  {Number(p.quantityActual)} {p.unitSnapshot ?? p.estimateItem?.unit ?? ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {extras.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">
            Додаткові роботи — рішення ПМ
          </div>
          <div className="space-y-2">
            {extras.map((x) => {
              const decided = x.pmDecision && x.pmDecision !== "PENDING";
              return (
                <div key={x.id} className="rounded-lg bg-zinc-950 px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-zinc-200">
                      {x.nameOverride ?? x.title}
                      {x.quantity && (
                        <span className="text-zinc-500">
                          {" "}
                          · {Number(x.quantity)} {x.unitOverride ?? x.unit ?? ""}
                        </span>
                      )}
                    </div>
                    {x.pmDecision && (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          decided
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {x.pmDecision}
                      </span>
                    )}
                  </div>

                  {canDecide && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {/* LINKED */}
                      {linkTargets.length > 0 && (
                        <select
                          disabled={busyId === x.id}
                          value={x.pmDecision === "LINKED" ? x.linkedEstimateItemId ?? "" : ""}
                          onChange={(e) =>
                            e.target.value &&
                            decide(x.id, {
                              pmDecision: "LINKED",
                              linkedEstimateItemId: e.target.value,
                            })
                          }
                          className="rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200"
                        >
                          <option value="">🔗 Прив'язати до роботи…</option>
                          {linkTargets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        disabled={busyId === x.id}
                        onClick={() => toChangeOrder(x.id)}
                        className="flex items-center gap-1 rounded-lg bg-blue-600/20 text-blue-300 border border-blue-600/40 px-2 py-1.5 text-xs"
                      >
                        <FilePlus2 size={13} /> ДКО
                      </button>
                      <button
                        type="button"
                        disabled={busyId === x.id}
                        onClick={() => decide(x.id, { pmDecision: "INFO_ONLY" })}
                        className="flex items-center gap-1 rounded-lg bg-zinc-800 text-zinc-300 px-2 py-1.5 text-xs"
                      >
                        <Info size={13} /> Інфо
                      </button>
                      {busyId === x.id && <Loader2 size={14} className="animate-spin text-zinc-400" />}
                    </div>
                  )}
                  {x.pmDecision === "LINKED" && x.linkedEstimateItem && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-emerald-300">
                      <Link2 size={12} /> {x.linkedEstimateItem.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canDecide && (
        <div className="pt-1">
          {showRevision ? (
            <div className="space-y-2">
              <textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Що треба виправити (буде показано виконробу)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white text-sm focus:border-amber-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRevision(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  disabled={busyId === "revision" || revisionNotes.trim().length < 3}
                  onClick={sendRevision}
                  className="flex-1 px-4 py-2 rounded-lg bg-amber-500 text-zinc-950 font-semibold text-sm disabled:opacity-50"
                >
                  На доопрацювання
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowRevision(true)}
              className="text-sm text-amber-300 font-medium"
            >
              ↩ Повернути на доопрацювання
            </button>
          )}
        </div>
      )}
    </div>
  );
}
