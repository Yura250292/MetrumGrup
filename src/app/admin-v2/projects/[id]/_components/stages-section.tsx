"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Plus,
  FileDown,
  ClipboardPaste,
  Save,
  CheckCircle2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { stageDisplayName } from "@/lib/constants";
import {
  StageTable,
  type StageRow,
  type StageInlineUpdate,
  type ViewMode,
  type DropPosition,
} from "./stage-table";
import { StageDetailDrawer, StageDetailEmbedded } from "./stage-detail-drawer";
import {
  StageMaterialsPopup,
  StageMaterialsEmbedded,
} from "./stage-materials-popup";
import { ImportEstimateModal } from "./import-estimate-modal";
import { PasteSpreadsheetModal } from "./paste-spreadsheet-modal";
import { PublishFinanceDialog } from "./publish-finance-dialog";
import { ProjectsSidebar } from "./projects-sidebar";

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
  projectTitle,
  initialStages,
  candidates,
  isTestProject,
}: StagesSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFullscreen = searchParams.get("fs") === "1";

  const setFullscreen = useCallback(
    (next: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("fs", "1");
      else params.delete("fs");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [stages, setStages] = useState<StageRow[]>(initialStages);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  // Materials popup live окремо від drawer-а: користувач може закрити popup
  // (materialsHidden=true) залишивши drawer відкритим. Зміна selectedStageId
  // ресетить materialsHidden — popup знову зʼявляється для нового етапу.
  const [materialsHidden, setMaterialsHidden] = useState(false);

  // Persist hideCompleted in localStorage like viewMode.
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

  // Body scroll lock у fullscreen-режимі (паттерн із pivot-fullscreen-modal).
  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  // Централізований ESC-handler (для desktop/embedded + fullscreen):
  // 1. Якщо fullscreen → exit fullscreen.
  // 2. Інакше якщо вибрано етап → deselect.
  // У floating-режимі (mobile) ESC обробляє сам StageDetailDrawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isFullscreen) {
        setFullscreen(false);
        return;
      }
      if (selectedStageId) {
        // Тільки на desktop (lg+) — на mobile drawer сам слухає ESC.
        if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
          setSelectedStageId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, selectedStageId, setFullscreen]);

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

  // Drag-and-drop переміщення етапу. Обчислюємо новий parentStageId та
  // sortOrder з поточного стану (siblings без переміщуваного), і шлемо в
  // /move endpoint, який валідує depth/cycle і робить atomic renumber.
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
        // У кінець списку дітей таргета.
        sortOrder = siblings.length;
      } else {
        const idx = siblings.findIndex((s) => s.id === targetId);
        if (idx < 0) return;
        sortOrder = position === "after" ? idx + 1 : idx;
      }

      // Optimistic: переставити локально, щоб UI не моргав.
      setStages((prev) => {
        const moved = prev.find((s) => s.id === draggedId);
        if (!moved) return prev;
        // Фільтруємо siblings цільового parent-а без dragged.
        const sibList = prev
          .filter((s) => s.parentStageId === newParentId && s.id !== draggedId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const insertIdx = Math.max(0, Math.min(sortOrder, sibList.length));
        // Renumber: всі siblings з індексом >= insertIdx отримують +1.
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

  const parentStageNameOf = (s: StageRow) =>
    s.parentStageId
      ? (() => {
          const p = stages.find((x) => x.id === s.parentStageId);
          return p ? stageDisplayName(p) : null;
        })()
      : null;

  const tableBlock = (
    <>
      <StageTable
        stages={
          hideCompleted
            ? stages.filter((s) => s.status !== "COMPLETED")
            : stages
        }
        selectedStageId={selectedStageId}
        onStageClick={(id) => {
          setSelectedStageId(id);
          setMaterialsHidden(false);
        }}
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
    </>
  );

  const sharedModals = (
    <>
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
    </>
  );

  const innerBody = (
    <>
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
            onClick={() => setHideCompleted((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium transition hover:brightness-95"
            style={{
              color: hideCompleted ? T.accentPrimary : T.textMuted,
            }}
            title={
              hideCompleted
                ? "Показати завершені етапи"
                : "Сховати етапи зі статусом «Завершено»"
            }
          >
            {hideCompleted ? <Eye size={12} /> : <EyeOff size={12} />}
            {hideCompleted ? "Показ. завершені" : "Сховати завершені"}
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
          <button
            type="button"
            onClick={() => setFullscreen(!isFullscreen)}
            title={isFullscreen ? "Згорнути на сторінку" : "Розгорнути на весь екран"}
            className="hidden lg:flex items-center gap-1 text-xs font-semibold transition hover:brightness-[0.97]"
            style={{ color: T.textSecondary }}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            {isFullscreen ? "Згорнути" : "Розгорнути"}
          </button>
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

      {/* Desktop (lg+): pinned split-grid коли вибрано етап. Інакше — одна колонка. */}
      <div
        className={
          selected
            ? "hidden lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4"
            : "hidden lg:block"
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          {tableBlock}
          {selected && !materialsHidden && (
            <StageMaterialsEmbedded
              projectId={projectId}
              stageId={selected.id}
              stageName={stageDisplayName(selected)}
              onClose={() => setMaterialsHidden(true)}
              style={{
                maxHeight: isFullscreen ? "calc(100vh - 360px)" : "40vh",
                minHeight: 200,
              }}
            />
          )}
        </div>
        {selected && (
          <div
            className={
              isFullscreen
                ? "h-[calc(100vh-160px)] sticky top-0"
                : "max-h-[75vh] sticky top-4"
            }
          >
            <StageDetailEmbedded
              projectId={projectId}
              projectTitle={projectTitle}
              stage={selected}
              parentStageName={parentStageNameOf(selected)}
              candidates={candidates}
              onClose={() => setSelectedStageId(null)}
              onChanged={refetch}
              className="h-full"
            />
          </div>
        )}
      </div>

      {/* Mobile (<lg): floating drawer + slide-up popup (поточний UX) */}
      <div className="lg:hidden">
        {tableBlock}
        {selected && (
          <StageDetailDrawer
            projectId={projectId}
            projectTitle={projectTitle}
            stage={selected}
            parentStageName={parentStageNameOf(selected)}
            candidates={candidates}
            onClose={() => setSelectedStageId(null)}
            onChanged={refetch}
          />
        )}
        {selected && !materialsHidden && (
          <StageMaterialsPopup
            projectId={projectId}
            stageId={selected.id}
            stageName={stageDisplayName(selected)}
            onClose={() => setMaterialsHidden(true)}
          />
        )}
      </div>

      {sharedModals}
    </>
  );

  // Fullscreen overlay або звичайна картка-обгортка.
  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 z-[100] flex"
        style={{ backgroundColor: T.background }}
      >
        <div className="hidden lg:block w-[260px] flex-shrink-0">
          <ProjectsSidebar activeProjectId={projectId} preserveFullscreen />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-5">
          {innerBody}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      {innerBody}
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
