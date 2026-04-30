"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit3, Eye, EyeOff } from "lucide-react";
import type { StageStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { StageTable, type StageRow } from "./stage-table";
import { StageDetailDrawer } from "./stage-detail-drawer";

export type ResponsibleCandidate = { id: string; name: string };

type StagesSectionProps = {
  projectId: string;
  initialStages: StageRow[];
  candidates: ResponsibleCandidate[];
};

export function StagesSection({
  projectId,
  initialStages,
  candidates,
}: StagesSectionProps) {
  const router = useRouter();
  const [stages, setStages] = useState<StageRow[]>(initialStages);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [, startTransition] = useTransition();

  // Якщо SSR-стартові пропси оновилися (router.refresh() після PATCH в drawer-і),
  // підхоплюємо нові значення в локальний state.
  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);

  const inlineUpdate = useCallback(
    async (
      stageId: string,
      data: { status?: StageStatus; responsibleUserId?: string | null },
    ) => {
      // Optimistic update
      setStages((prev) =>
        prev.map((s) =>
          s.id === stageId
            ? {
                ...s,
                ...(data.status !== undefined ? { status: data.status } : {}),
                ...(data.responsibleUserId !== undefined
                  ? {
                      responsibleUserId: data.responsibleUserId,
                      responsibleName:
                        candidates.find((c) => c.id === data.responsibleUserId)?.name ??
                        null,
                    }
                  : {}),
              }
            : s,
        ),
      );
      try {
        const res = await fetch(
          `/api/admin/projects/${projectId}/stages/${stageId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          },
        );
        if (!res.ok) throw new Error("PATCH failed");
        await refetch();
      } catch (err) {
        console.error("[stages-section] inline update failed", err);
        await refetch();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, candidates],
  );

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data?: { stages?: Array<Record<string, unknown>> };
      };
      const fresh = json.data?.stages;
      if (!fresh) return;
      setStages(
        fresh.map((s) => ({
          id: String(s.id),
          parentStageId: (s.parentStageId as string | null) ?? null,
          sortOrder: Number(s.sortOrder ?? 0),
          stage: (s.stage as StageRow["stage"]) ?? null,
          customName: (s.customName as string | null) ?? null,
          isHidden: Boolean(s.isHidden),
          status: s.status as StageRow["status"],
          progress: Number(s.progress ?? 0),
          startDate: (s.startDate as Date | string | null) ?? null,
          endDate: (s.endDate as Date | string | null) ?? null,
          notes: (s.notes as string | null) ?? null,
          responsibleUserId: (s.responsibleUserId as string | null) ?? null,
          responsibleName:
            (s as { responsibleUser?: { name?: string } }).responsibleUser?.name ??
            null,
          allocatedBudget:
            s.allocatedBudget === null || s.allocatedBudget === undefined
              ? null
              : Number(s.allocatedBudget),
          unit: (s.unit as string | null) ?? null,
          planVolume:
            s.planVolume === null || s.planVolume === undefined
              ? null
              : Number(s.planVolume),
          factVolume:
            s.factVolume === null || s.factVolume === undefined
              ? null
              : Number(s.factVolume),
          planExpense: Number(s.planExpense ?? 0),
          factExpense: Number(s.factExpense ?? 0),
          planIncome: Number(s.planIncome ?? 0),
          factIncome: Number(s.factIncome ?? 0),
        })),
      );
      // Тригернемо SSR refresh — щоб оновилася також стрічка «Прогрес проєкту»
      // (currentStage / stageProgress) в parent-картці.
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("[stages-section] refetch failed", err);
    }
  }, [projectId, router]);

  const selected = stages.find((s) => s.id === selectedStageId) ?? null;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
          Етапи виконання
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium transition hover:brightness-95"
            style={{ color: T.textMuted }}
          >
            {showHidden ? <EyeOff size={12} /> : <Eye size={12} />}
            {showHidden ? "Сховати приховані" : "Показати всі"}
          </button>
          <Link
            href={`/admin-v2/projects/${projectId}/stages`}
            className="flex items-center gap-1 text-xs font-semibold transition hover:brightness-[0.97]"
            style={{ color: T.accentPrimary }}
          >
            <Edit3 size={12} /> Редагувати
          </Link>
        </div>
      </div>

      <StageTable
        stages={stages}
        selectedStageId={selectedStageId}
        onStageClick={setSelectedStageId}
        onInlineUpdate={inlineUpdate}
        candidates={candidates}
        showHidden={showHidden}
      />

      {selected && (
        <StageDetailDrawer
          projectId={projectId}
          stage={selected}
          candidates={candidates}
          onClose={() => setSelectedStageId(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}
