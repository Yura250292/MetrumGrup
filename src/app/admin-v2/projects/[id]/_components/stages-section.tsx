"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Plus,
  FileDown,
  ClipboardPaste,
  Save,
  CheckCircle2,
  MoreHorizontal,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useDrillDown } from "@/components/drawer/use-drill-down";
import {
  buildStageDrawerId,
  STAGE_UPDATED_EVENT,
  type StageUpdatedDetail,
} from "@/components/drawer/renderers/StageDrawerContent";
import {
  StageTable,
  type StageRow,
  type StageInlineUpdate,
  type ViewMode,
  type DropPosition,
} from "./stage-table";
import { StageMobileList } from "./stage-mobile-list";
import { ImportEstimateModal } from "./import-estimate-modal";
import { PasteSpreadsheetModal } from "./paste-spreadsheet-modal";
import { PublishFinanceDialog } from "./publish-finance-dialog";

export type ResponsibleCandidate = { id: string; name: string };

type StagesSectionProps = {
  projectId: string;
  projectTitle: string;
  initialStages: StageRow[];
  candidates: ResponsibleCandidate[];
  isTestProject: boolean;
};

export function StagesSection({
  projectId,
  projectTitle: _projectTitle,
  initialStages,
  candidates,
  isTestProject,
}: StagesSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const drawer = useDrillDown();

  // ── Backward-compat: старі `?fs=1` URL (fullscreen mode) — soft-strip,
  //    бо новий drawer-патерн не потребує fullscreen-режиму.
  const stripFsFlagRef = useRef(false);
  useEffect(() => {
    if (stripFsFlagRef.current) return;
    stripFsFlagRef.current = true;
    if (searchParams.get("fs") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("fs");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const [stages, setStages] = useState<StageRow[]>(initialStages);
  const [showHidden, setShowHidden] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("metrum.stage-table.hide-completed");
      if (raw === "1") setHideCompleted(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "metrum.stage-table.hide-completed",
        hideCompleted ? "1" : "0",
      );
    } catch {}
  }, [hideCompleted]);

  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [dirtyStageIds, setDirtyStageIds] = useState<Set<string>>(() => new Set());
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [, startTransition] = useTransition();

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

  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);

  const inlineUpdate = useCallback(
    async (stageId: string, data: StageInlineUpdate) => {
      // Optimistic update — одразу прокатуємо зміни.
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
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("[stages-section] refetch failed", err);
    }
  }, [projectId, router]);

  // Listen for stage-updated events from drawer (PATCH/POST inside detail content).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<StageUpdatedDetail>).detail;
      if (!detail || detail.projectId !== projectId) return;
      void refetch();
    };
    window.addEventListener(STAGE_UPDATED_EVENT, handler);
    return () => window.removeEventListener(STAGE_UPDATED_EVENT, handler);
  }, [projectId, refetch]);

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

  const moveStage = useCallback(
    async (draggedId: string, targetId: string, position: DropPosition) => {
      const target = stages.find((s) => s.id === targetId);
      if (!target) return;

      const newParentId =
        position === "child" ? targetId : target.parentStageId;

      const siblings = stages
        .filter((s) => s.parentStageId === newParentId && s.id !== draggedId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      let sortOrder: number;
      if (position === "child") {
        sortOrder = siblings.length;
      } else {
        const idx = siblings.findIndex((s) => s.id === targetId);
        if (idx < 0) return;
        sortOrder = position === "after" ? idx + 1 : idx;
      }

      setStages((prev) => {
        const moved = prev.find((s) => s.id === draggedId);
        if (!moved) return prev;
        const sibList = prev
          .filter((s) => s.parentStageId === newParentId && s.id !== draggedId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const insertIdx = Math.max(0, Math.min(sortOrder, sibList.length));
        const sibIdsBumped = new Set(
          sibList.slice(insertIdx).map((s) => s.id),
        );
        return prev.map((s) => {
          if (s.id === draggedId) {
            return { ...s, parentStageId: newParentId, sortOrder: insertIdx };
          }
          if (sibIdsBumped.has(s.id)) {
            return { ...s, sortOrder: s.sortOrder + 1 };
          }
          return s;
        });
      });

      try {
        const res = await fetch(
          `/api/admin/projects/${projectId}/stages/${draggedId}/move`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parentStageId: newParentId,
              sortOrder,
            }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Помилка переміщення");
        }
        await refetch();
      } catch (err) {
        console.error("[stages-section] move failed", err);
        alert(err instanceof Error ? err.message : "Помилка переміщення");
        await refetch();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, stages],
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
        await refetch();
      } catch (err) {
        console.error("[stages-section] delete failed", err);
        alert(err instanceof Error ? err.message : "Помилка видалення");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

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

  const openStage = useCallback(
    (stageId: string) => {
      drawer.open({ type: "stage", id: buildStageDrawerId(projectId, stageId) });
    },
    [drawer, projectId],
  );

  const filteredStages = hideCompleted
    ? stages.filter((s) => s.status !== "COMPLETED")
    : stages;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
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
        <div className="flex items-center gap-2 flex-wrap sm:gap-3">
          <div className="-mx-1 overflow-x-auto sm:mx-0 sm:overflow-visible">
            <ViewModeSwitch value={viewMode} onChange={setViewMode} />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              title="Додаткові дії"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:brightness-95"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textSecondary,
                border: `1px solid ${T.borderSoft}`,
              }}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
            >
              <MoreHorizontal size={14} />
            </button>
            {overflowOpen && (
              <>
                {/* click-out backdrop */}
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setOverflowOpen(false)}
                  aria-hidden
                />
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg shadow-lg"
                  style={{
                    backgroundColor: T.panel,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  <OverflowItem
                    icon={showHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    label={showHidden ? "Сховати приховані" : "Показати приховані"}
                    onClick={() => {
                      setShowHidden((v) => !v);
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowItem
                    icon={hideCompleted ? <Eye size={13} /> : <EyeOff size={13} />}
                    label={hideCompleted ? "Показати завершені" : "Сховати завершені"}
                    active={hideCompleted}
                    onClick={() => {
                      setHideCompleted((v) => !v);
                      setOverflowOpen(false);
                    }}
                  />
                  <div
                    style={{
                      height: 1,
                      backgroundColor: T.borderSoft,
                      margin: "2px 0",
                    }}
                  />
                  <OverflowItem
                    icon={<FileDown size={13} />}
                    label="Імпорт з кошторису"
                    onClick={() => {
                      setImportOpen(true);
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowItem
                    icon={<ClipboardPaste size={13} />}
                    label="Вставити з Excel"
                    onClick={() => {
                      setPasteOpen(true);
                      setOverflowOpen(false);
                    }}
                  />
                </div>
              </>
            )}
          </div>
          {!isTestProject && dirtyStageIds.size > 0 && (
            <button
              type="button"
              onClick={() => setPublishOpen(true)}
              title="Опублікувати draft-зміни у фінансовому журналі"
              className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: T.success,
                color: "white",
              }}
            >
              <Save size={12} />
              {`Опублікувати ${dirtyStageIds.size} змін${
                dirtyStageIds.size === 1 ? "у" : ""
              }`}
            </button>
          )}
        </div>
      </div>

      {/* Desktop (lg+): таблиця */}
      <div className="hidden lg:block">
        <StageTable
          stages={filteredStages}
          selectedStageId={null}
          onStageClick={openStage}
          onInlineUpdate={inlineUpdate}
          onAddChild={addChild}
          onDelete={deleteStage}
          candidates={candidates}
          showHidden={showHidden}
          dirtyStageIds={dirtyStageIds}
          viewMode={viewMode}
          onMoveStage={moveStage}
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
      </div>

      {/* Mobile (<lg): card-list */}
      <div className="lg:hidden">
        <StageMobileList
          stages={filteredStages}
          selectedStageId={null}
          onStageClick={openStage}
          onInlineUpdate={inlineUpdate}
          onAddChild={addChild}
          onDelete={deleteStage}
          showHidden={showHidden}
          dirtyStageIds={dirtyStageIds}
        />
        <button
          type="button"
          onClick={() => addChild(null)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[12px] font-medium transition hover:brightness-95"
          style={{
            borderColor: T.borderSoft,
            color: T.accentPrimary,
            backgroundColor: T.panelSoft,
          }}
        >
          <Plus size={14} />
          Додати етап
        </button>
      </div>

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

function OverflowItem({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:brightness-95"
      style={{
        color: active ? T.accentPrimary : T.textPrimary,
        backgroundColor: "transparent",
      }}
    >
      <span style={{ color: T.textMuted }}>{icon}</span>
      <span>{label}</span>
    </button>
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
