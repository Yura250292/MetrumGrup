"use client";

import { useMemo, useState } from "react";
import { Check, X, Edit3, ChevronDown, ChevronUp } from "lucide-react";

import { FIRM_BRAND } from "@/lib/firm/scope";

import type { ProposalData } from "../page";

const STATE_LABELS: Record<ProposalData["itemStates"][number]["state"], string> = {
  PENDING: "Очікує",
  CLIENT_APPROVED: "Погоджено",
  CLIENT_REJECTED: "Відхилено",
  CLIENT_COUNTERED: "Ваша пропозиція",
  FIRM_COUNTERED: "Пропозиція підрядника",
  FIRM_REJECTED: "Відхилено підрядником",
  FINAL: "Завершено",
};

const STATE_COLORS: Record<ProposalData["itemStates"][number]["state"], string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  CLIENT_APPROVED: "bg-green-100 text-green-700",
  CLIENT_REJECTED: "bg-red-100 text-red-700",
  CLIENT_COUNTERED: "bg-amber-100 text-amber-700",
  FIRM_COUNTERED: "bg-indigo-100 text-indigo-700",
  FIRM_REJECTED: "bg-red-100 text-red-700",
  FINAL: "bg-zinc-200 text-zinc-700",
};

type ItemAction = "APPROVE" | "REJECT" | "COUNTER";

/**
 * Клієнтський компонент — інтерактивний review. У Phase 2 рендеримо UI, але
 * respond-кнопки чекають на public POST /respond endpoint (Phase 3.1) — поки
 * показуємо тільки disabled, щоб клієнт побачив проєкт інтерфейсу.
 */
export function ProposalReviewClient({
  token,
  proposal,
}: {
  token: string;
  proposal: ProposalData;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState<string | null>(null);
  const [counterQty, setCounterQty] = useState("");
  const [counterPrice, setCounterPrice] = useState("");
  const [counterComment, setCounterComment] = useState("");
  const [localItems, setLocalItems] = useState(proposal.itemStates);

  const brand = FIRM_BRAND[proposal.estimate.project.firmId ?? proposal.firmId];

  const groupedBySection = useMemo(() => {
    const groups = new Map<string, typeof localItems>();
    for (const item of localItems) {
      const key = item.estimateItem.section?.id ?? "no-section";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries()).map(([sectionId, items]) => {
      const section = items[0].estimateItem.section;
      return {
        sectionId,
        title: section?.title ?? "Без розділу",
        sortOrder: section?.sortOrder ?? 999,
        items: items.sort(
          (a, b) => a.estimateItem.sortOrder - b.estimateItem.sortOrder,
        ),
      };
    });
  }, [localItems]);

  function toggleExpand(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyAction(
    item: ProposalData["itemStates"][number],
    action: ItemAction,
    qty?: string,
    price?: string,
    comment?: string,
  ) {
    setActing(item.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/estimate-proposal/${token}/items/${item.id}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            expectedRound: item.currentRound,
            proposedQuantity: qty,
            proposedUnitPrice: price,
            comment,
          }),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          actual?: number;
        };
        if (res.status === 409 && typeof json.actual === "number") {
          throw new Error(
            "Дані оновились. Перезавантажте сторінку (поточний раунд " +
              json.actual +
              ")",
          );
        }
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        data: { nextState: ProposalData["itemStates"][number]["state"]; roundNumber: number };
      };
      // Оптимістично оновлюємо локальний стан.
      setLocalItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                state: json.data.nextState,
                currentRound: json.data.roundNumber,
                lastActorSide: "client",
              }
            : p,
        ),
      );
      setCounterOpen(null);
      setCounterQty("");
      setCounterPrice("");
      setCounterComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setActing(null);
    }
  }

  const canAct = (state: ProposalData["itemStates"][number]["state"]) =>
    state === "PENDING" || state === "FIRM_COUNTERED";

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-zinc-50 px-4 py-6 sm:px-6 sm:py-10">
      {/* Hero */}
      <header
        className="mb-6 rounded-2xl p-6 text-white shadow-sm"
        style={{ background: brand.gradient }}
      >
        <p className="mb-1 text-xs uppercase tracking-wider opacity-80">
          Кошторис · {proposal.estimate.number}
        </p>
        <h1 className="text-xl font-bold sm:text-2xl">
          {proposal.estimate.title}
        </h1>
        <p className="mt-1 text-sm opacity-90">
          {proposal.estimate.project.title}
          {proposal.estimate.project.address
            ? ` · ${proposal.estimate.project.address}`
            : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-full bg-white/15 px-3 py-1">
            Всього позицій: {proposal.itemsTotal}
          </span>
          {proposal.itemsApproved > 0 && (
            <span className="rounded-full bg-white/15 px-3 py-1">
              Погоджено: {proposal.itemsApproved}
            </span>
          )}
          {proposal.itemsPending > 0 && (
            <span className="rounded-full bg-amber-300/30 px-3 py-1 font-semibold">
              Очікує вашого рішення: {proposal.itemsPending}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sections */}
      <div className="flex flex-col gap-6">
        {groupedBySection.map((g) => (
          <section key={g.sectionId} className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-zinc-600">
              {g.title}
            </h2>
            <div className="flex flex-col gap-2">
              {g.items.map((item) => {
                const isExpanded = expandedItems.has(item.id);
                const canActOnThis = canAct(item.state);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-zinc-900">
                          {item.estimateItem.description}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {item.currentQuantity} {item.estimateItem.unit} ×{" "}
                          {Number(item.currentUnitPrice).toLocaleString("uk-UA")} грн
                          {" = "}
                          <span className="font-semibold text-zinc-700">
                            {Number(item.currentAmount).toLocaleString("uk-UA")} грн
                          </span>
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${STATE_COLORS[item.state]}`}
                      >
                        {STATE_LABELS[item.state]}
                      </span>
                    </div>

                    {canActOnThis && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={acting === item.id}
                          onClick={() => void applyAction(item, "APPROVE")}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check size={12} />
                          Погодити
                        </button>
                        <button
                          disabled={acting === item.id}
                          onClick={() => void applyAction(item, "REJECT")}
                          className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          <X size={12} />
                          Відхилити
                        </button>
                        <button
                          disabled={acting === item.id}
                          onClick={() => {
                            setCounterOpen(item.id);
                            setCounterQty(item.currentQuantity);
                            setCounterPrice(item.currentUnitPrice);
                            setCounterComment("");
                          }}
                          className="flex items-center gap-1 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                        >
                          <Edit3 size={12} />
                          Запропонувати своє
                        </button>
                      </div>
                    )}

                    {counterOpen === item.id && (
                      <div className="mt-2 flex flex-col gap-2 rounded-xl bg-zinc-50 p-3">
                        <label className="flex items-center gap-2 text-xs text-zinc-600">
                          Кількість:
                          <input
                            type="number"
                            step="0.001"
                            value={counterQty}
                            onChange={(e) => setCounterQty(e.target.value)}
                            className="w-32 rounded border border-zinc-300 px-2 py-1 text-sm"
                          />
                          {item.estimateItem.unit}
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-600">
                          Ціна за од.:
                          <input
                            type="number"
                            step="0.01"
                            value={counterPrice}
                            onChange={(e) => setCounterPrice(e.target.value)}
                            className="w-32 rounded border border-zinc-300 px-2 py-1 text-sm"
                          />
                          грн
                        </label>
                        <textarea
                          placeholder="Коментар (за бажанням)"
                          value={counterComment}
                          onChange={(e) => setCounterComment(e.target.value)}
                          className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          rows={2}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setCounterOpen(null)}
                            className="rounded px-3 py-1 text-xs text-zinc-600"
                          >
                            Скасувати
                          </button>
                          <button
                            disabled={acting === item.id}
                            onClick={() =>
                              void applyAction(
                                item,
                                "COUNTER",
                                counterQty,
                                counterPrice,
                                counterComment.trim() || undefined,
                              )
                            }
                            className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white"
                          >
                            Надіслати пропозицію
                          </button>
                        </div>
                      </div>
                    )}

                    {item.currentRound > 0 && (
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="flex items-center gap-1 self-start text-xs text-zinc-500 hover:text-zinc-700"
                      >
                        {isExpanded ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )}
                        Історія раундів (#{item.currentRound})
                      </button>
                    )}

                    {isExpanded && (
                      <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
                        Деталі історії будуть тут у Phase 3 — окремий drawer.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-10 text-center text-xs text-zinc-500">
        Документ № {proposal.estimate.number}. Усі дії підписуються цифрово.
      </footer>
    </main>
  );
}
