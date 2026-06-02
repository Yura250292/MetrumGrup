"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { DollarSign, Loader2 } from "lucide-react";
import { ProjectEstimatesSection } from "@/components/projects/ProjectEstimatesSection";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DARK_VARS } from "@/app/admin-v2/_lib/dark-overrides";
import { formatCurrency } from "@/lib/utils";

export function TabEstimates({ projectId }: { projectId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canSync = role === "FINANCIER" || role === "SUPER_ADMIN" || role === "MANAGER";

  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (!confirm(
      "Синхронізувати всі APPROVED кошториси проєкту з фінансуванням?\n\n" +
      "Попередньо синхронізовані автозаписи буде перезаписано. Ручні записи не чіпаються."
    )) return;

    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/sync-finances`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Помилка синхронізації");

      const d = json.data;
      if (d.estimatesProcessed === 0) {
        alert(json.message);
      } else {
        alert(
          `Синхронізовано кошторисів: ${d.estimatesProcessed}\n` +
          (d.estimatesSkipped ? `Пропущено не-APPROVED: ${d.estimatesSkipped}\n` : "") +
          `Створено планових позицій: ${d.itemsCreated}\n` +
          `План витрат: ${formatCurrency(d.totalExpense)}\n` +
          `План доходу: ${formatCurrency(d.totalIncome)}`
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка синхронізації");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
          Кошториси проєкту
        </h2>
        {canSync && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
            style={{
              backgroundColor: T.accentPrimarySoft,
              color: T.accentPrimary,
              border: `1px solid ${T.accentPrimary}40`,
            }}
            title="Перенести плани витрат з усіх APPROVED кошторисів у модуль фінансування"
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />}
            Синхронізувати фінанси
          </button>
        )}
      </div>
      <div className="admin-light" style={DARK_VARS}>
        <ProjectEstimatesSection projectId={projectId} />
      </div>
    </div>
  );
}
