"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertTriangle } from "lucide-react";
import type { SupplierDebtRow } from "@/lib/owner/queries";

const formatUah = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} млн`;
  }
  if (Math.abs(n) >= 1_000) {
    return `${(n / 1_000).toLocaleString("uk-UA", { maximumFractionDigits: 1 })} тис`;
  }
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

interface Props {
  visible: boolean;
}

export function DebtPanel({ visible }: Props) {
  const [items, setItems] = useState<SupplierDebtRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || items !== null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/owner/debt");
        if (!r.ok) throw new Error("fetch");
        const d = await r.json();
        if (cancelled) return;
        setItems(d.suppliers ?? []);
      } catch {
        if (!cancelled) setError("Не вдалось завантажити список");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, items]);

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="debt-panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          style={{ overflow: "hidden" }}
        >
          <div className="rounded-2xl bg-zinc-900/60 border border-orange-500/20 backdrop-blur-md mt-2 overflow-hidden">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-zinc-500 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Завантажую…
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center gap-2 py-6 text-rose-400 text-sm">
                <AlertTriangle size={14} />
                {error}
              </div>
            )}
            {!loading && !error && items && items.length === 0 && (
              <div className="text-center py-6 text-zinc-500 text-sm">Немає несплачених рахунків.</div>
            )}
            {!loading && !error && items && items.length > 0 && (
              <ul className="divide-y divide-orange-500/10">
                {items.map((s, i) => {
                  const overdueDays = daysSince(s.oldestUnpaidAt);
                  const isCritical = overdueDays !== null && overdueDays > 60;
                  const isWarning = overdueDays !== null && overdueDays > 30 && !isCritical;
                  return (
                    <motion.li
                      key={s.counterpartyId}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.03 }}
                      className="px-4 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs text-zinc-500 font-mono w-5 shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-sm font-semibold text-white truncate" title={s.name}>
                            {s.name}
                          </span>
                        </div>
                        <span
                          className={`text-base font-bold tabular-nums shrink-0 ${
                            isCritical
                              ? "text-rose-300"
                              : isWarning
                                ? "text-orange-300"
                                : "text-orange-200"
                          }`}
                        >
                          {formatUah(s.totalDebt)} грн
                        </span>
                      </div>
                      <div className="ml-7 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                        <span className="text-zinc-500">
                          Записів:{" "}
                          <span className="text-zinc-300 font-medium">{s.unpaidEntriesCount}</span>
                        </span>
                        <span className="text-zinc-500">
                          Найдавніший:{" "}
                          <span
                            className={
                              isCritical
                                ? "text-rose-300 font-bold"
                                : isWarning
                                  ? "text-orange-300 font-medium"
                                  : "text-zinc-300"
                            }
                          >
                            {formatDate(s.oldestUnpaidAt)}
                            {overdueDays !== null && overdueDays > 0
                              ? ` (${overdueDays} дн)`
                              : ""}
                          </span>
                        </span>
                        <span className="text-zinc-500">
                          Остання оплата:{" "}
                          <span className="text-zinc-300">{formatDate(s.lastPaidAt)}</span>
                        </span>
                        {s.lastProjectTitle && (
                          <span className="text-zinc-500 truncate">
                            Об{"’"}єкт:{" "}
                            <span className="text-zinc-300" title={s.lastProjectTitle}>
                              {s.lastProjectTitle}
                            </span>
                          </span>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
