"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Edit3,
  Eye,
  EyeOff,
  Plus,
  FileDown,
  ClipboardPaste,
  Save,
  CheckCircle2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  StageTable,
  type StageRow,
  type StageInlineUpdate,
  type ViewMode,
} from "./stage-table";
import { StageDetailDrawer } from "./stage-detail-drawer";
import { ImportEstimateModal } from "./import-estimate-modal";
import { PasteSpreadsheetModal } from "./paste-spreadsheet-modal";
import { PublishFinanceDialog } from "./publish-finance-dialog";

export type ResponsibleCandidate = { id: string; name: string };

type StagesSectionProps = {
  projectId: string;
  initialStages: StageRow[];
  candidates: ResponsibleCandidate[];
  isTestProject: boolean;
};

export function StagesSection({
  projectId,
  initialStages,
  candidates,
  isTestProject,
}: StagesSectionProps) {
  const router = useRouter();
  const [stages, setStages] = useState<StageRow[]>(initialStages);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [dirtyStageIds, setDirtyStageIds] = useState<Set<string>>(() => new Set());
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [, startTransition] = useTransition();

  // Режим перегляду таблиці. Init як "all" щоб уникнути SSR/CSR mismatch;
  // підвантажуємо persisted значення з localStorage у useEffect (як column-orders).
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("metrum.stage-table.view-mode");
      if (raw === "all" || raw === "plan" || raw === "fact" || raw === "compare") {
        setViewMode(raw);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("metrum.stage-table.view-mode", viewMode);
    } catch {}
  }, [viewMode]);

  // Якщо SSR-стартові пропси оновилися (router.refresh() після PATCH в drawer-і),
  // підхоплюємо нові значення в локальний state.
  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);

  const inlineUpdate = useCallback(
    async (stageId: string, data: StageInlineUpdate) => {
      // Optimistic update — одразу прокатуємо зміни, ще до server-respond.
      setStages((prev) =>
        prev.map((s) => {
          if (s.id !== stageId) return s;
          const next: StageRow = { ...s };
          if (data.status !== undefined) next.status = data.status;
          if (data.responsibleUserId !== undefined) {
            next.responsibleUserId = data.responsibleUserId;
            next.responsibleName =
              candidates.find((c) => c.id === data.responsibleUserId)?.name ?? null;
          }
          if (data.responsibleName !== undefined) {
            // Optimistic — backend сам зробить fuzzy-match і оновить FK,
            // refetch принесе фінальні значення.
            next.responsibleName = data.responsibleName;
            const matched = data.responsibleName
              ? candidates.find(
                  (c) =>
                    c.name.toLowerCase() ===
                    (data.responsibleName ?? "").toLowerCase(),
                )
              : null;
            next.responsibleUserId = matched?.id ?? null;
          }
          if (data.unit !== undefined) next.unit = data.unit;
          if (data.factUnit !== undefined) next.factUnit = data.factUnit;
          if (data.planVolume !== undefined) next.planVolume = data.planVolume;
          if (data.factVolume !== undefined) next.factVolume = data.factVolume;
          if (data.planUnitPrice !== undefined) next.planUnitPrice = data.planUnitPrice;
          if (data.factUnitPrice !== undefined) next.factUnitPrice = data.factUnitPrice;
          if (data.planClientUnitPrice !== undefined)
            next.planClientUnitPrice = data.planClientUnitPrice;
          if (data.factClientUnitPrice !== undefined)
            next.factClientUnitPrice = data.factClientUnitPrice;
          if (data.notes !== undefined) next.notes = data.notes;
          return next;
        }),
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
            (s.responsibleName as string | null) ??
            null,
          allocatedBudget:
            s.allocatedBudget === null || s.allocatedBudget === undefined
              ? null
              : Number(s.allocatedBudget),
          unit: (s.unit as string | null) ?? null,
          factUnit: (s.factUnit as string | null) ?? null,
          planVolume:
            s.planVolume === null || s.planVolume === undefined
              ? null
              : Number(s.planVolume),
          factVolume:
            s.factVolume === null || s.factVolume === undefined
              ? null
              : Number(s.factVolume),
          planUnitPrice:
            s.planUnitPrice === null || s.planUnitPrice === undefined
              ? null
              : Number(s.planUnitPrice),
          factUnitPrice:
            s.factUnitPrice === null || s.factUnitPrice === undefined
              ? null
              : Number(s.factUnitPrice),
          planClientUnitPrice:
            s.planClientUnitPrice === null || s.planClientUnitPrice === undefined
              ? null
              : Number(s.planClientUnitPrice),
          factClientUnitPrice:
            s.factClientUnitPrice === null || s.factClientUnitPrice === undefined
              ? null
              : Number(s.factClientUnitPrice),
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

  const addChild = useCallback(
    async (parentStageId: string | null) => {
      const defaultName = parentStageId ? "Новий підетап" : "Новий етап";
      const name = window.prompt(
        parentStageId ? "Назва підетапу:" : "Назва етапу:",
        defaultName,
      );
      if (!name || !name.trim()) return;
      try {
        const res = await fetch(`/api/admin/projects/${projectId}/stages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customName: name.trim(),
            parentStageId: parentStageId ?? null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Помилка створення");
        }
        await refetch();
      } catch (err) {
        console.error("[stages-section] add child failed", err);
        alert(err instanceof Error ? err.message : "Помилка створення");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

  const deleteStage = useCallback(
    async (stageId: string) => {
      try {
        const res = await fetch(
          `/api/admin/projects/${projectId}/stages/${stageId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Помилка видалення");
        }
        if (selectedStageId === stageId) setSelectedStageId(null);
        await refetch();
      } catch (err) {
        console.error("[stages-section] delete failed", err);
        alert(err instanceof Error ? err.message : "Помилка видалення");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, selectedStageId],
  );

  // Phase 3: завантажуємо dirty-список для рендеру dot-маркерів і лічильника
  // у кнопці «Опублікувати». Refetch після PATCH стейджу і після publish.
  const refetchDirty = useCallback(async () => {
    if (isTestProject) {
      setDirtyStageIds(new Set());
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/dirty-stages`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        data?: { dirty?: Array<{ stageId: string }> };
      };
      const ids = new Set((json.data?.dirty ?? []).map((d) => d.stageId));
      setDirtyStageIds(ids);
    } catch (err) {
      console.error("[stages-section] dirty fetch failed", err);
    }
  }, [projectId, isTestProject]);

  useEffect(() => {
    void refetchDirty();
  }, [refetchDirty, stages]);

  const onPublished = useCallback(() => {
    setSavedAt(new Date());
    void refetch();
    void refetchDirty();
  }, [refetch, refetchDirty]);

  const selected = stages.find((s) => s.id === selectedStageId) ?? null;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            Етапи виконання
          </h2>
          {isTestProject && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: T.warningSoft, color: T.warning }}
            >
              Тестовий проєкт
            </span>
          )}
          {savedAt && !isTestProject && (
            <span
              className="flex items-center gap-1 text-[11px]"
              style={{ color: T.success }}
            >
              <CheckCircle2 size={11} />
              Збережено {savedAt.toLocaleTimeString("uk-UA").slice(0, 5)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ViewModeSwitch value={viewMode} onChange={setViewMode} />
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium transition hover:brightness-95"
            style={{ color: T.textMuted }}
          >
            {showHidden ? <EyeOff size={12} /> : <Eye size={12} />}
            {showHidden ? "Сховати приховані" : "Показати всі"}
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            className="flex items-center gap-1 text-xs font-semibold transition hover:brightness-[0.97]"
            style={{ color: T.accentPrimary }}
          >
            <ClipboardPaste size={12} /> Excel
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 text-xs font-semibold transition hover:brightness-[0.97]"
            style={{ color: T.accentPrimary }}
          >
            <FileDown size={12} /> Імпорт з кошторису
          </button>
          <Link
            href={`/admin-v2/projects/${projectId}/stages`}
            className="flex items-center gap-1 text-xs font-semibold transition hover:brightness-[0.97]"
            style={{ color: T.accentPrimary }}
          >
            <Edit3 size={12} /> Редагувати
          </Link>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            disabled={isTestProject || dirtyStageIds.size === 0}
            title={
              isTestProject
                ? "Тестовий проєкт — публікація у фінансування вимкнена"
                : dirtyStageIds.size === 0
                  ? "Немає непублікованих змін"
                  : "Опублікувати draft-зміни у фінансовому журналі"
            }
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50"
            style={{
              backgroundColor: T.success,
              color: "white",
            }}
          >
            <Save size={12} />
            {dirtyStageIds.size > 0
              ? `Опублікувати ${dirtyStageIds.size} змін${
                  dirtyStageIds.size === 1 ? "у" : ""
                }`
              : "Опублікувати у фінансування"}
          </button>
        </div>
      </div>

      <StageTable
        stages={stages}
        selectedStageId={selectedStageId}
        onStageClick={setSelectedStageId}
        onInlineUpdate={inlineUpdate}
        onAddChild={addChild}
        onDelete={deleteStage}
        candidates={candidates}
        showHidden={showHidden}
        dirtyStageIds={dirtyStageIds}
        viewMode={viewMode}
      />

      <button
        type="button"
        onClick={() => addChild(null)}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[12px] font-medium transition hover:brightness-95"
        style={{
          borderColor: T.borderSoft,
          color: T.accentPrimary,
          backgroundColor: T.panelSoft,
        }}
      >
        <Plus size={14} />
        Додати етап
      </button>

      {selected && (
        <StageDetailDrawer
          projectId={projectId}
          stage={selected}
          candidates={candidates}
          onClose={() => setSelectedStageId(null)}
          onChanged={refetch}
        />
      )}

      {importOpen && (
        <ImportEstimateModal
          projectId={projectId}
          onClose={() => setImportOpen(false)}
          onImported={refetch}
        />
      )}

      {pasteOpen && (
        <PasteSpreadsheetModal
          projectId={projectId}
          onClose={() => setPasteOpen(false)}
          onImported={refetch}
        />
      )}

      <PublishFinanceDialog
        projectId={projectId}
        open={publishOpen}
        stages={stages}
        onClose={() => setPublishOpen(false)}
        onPublished={onPublished}
      />
    </div>
  );
}

const VIEW_MODE_OPTIONS: { value: ViewMode; label: string; title: string }[] = [
  { value: "all", label: "Усі", title: "Показати всі колонки (План + Факт)" },
  { value: "plan", label: "Тільки План", title: "Сховати колонки Факт" },
  { value: "fact", label: "Тільки Факт", title: "Сховати колонки План" },
  {
    value: "compare",
    label: "Порівняти",
    title: "План ↔ Факт парами зі знаком відхилення",
  },
];

function ViewModeSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-lg p-0.5"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {VIEW_MODE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className="rounded px-2.5 py-1 text-[11px] font-medium transition"
            style={{
              backgroundColor: active ? T.panel : "transparent",
              color: active ? T.accentPrimary : T.textMuted,
              boxShadow: active ? `0 1px 2px ${T.borderSoft}` : undefined,
              fontWeight: active ? 600 : 500,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
