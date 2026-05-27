"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { stageDisplayName } from "@/lib/constants";
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
import { StagesAiAssistant } from "./stages-ai-assistant";
import { AiRestructureModal } from "./ai-restructure-modal";

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

  // ── Backward-compat: старі `?fs=1` URL (legacy fullscreen mode) — soft-strip.
  //    Новий Excel-mode використовує `?excel=1`.
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

  const excelMode = searchParams.get("excel") === "1";
  const setExcelMode = useCallback(
    (next: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("excel", "1");
      else params.delete("excel");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Lock body scroll у Excel-режимі (повноекранний overlay).
  useEffect(() => {
    if (!excelMode) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [excelMode]);

  // ESC виходить з Excel-режиму (тільки коли фокус не в інпуті — щоб не
  // конфліктувати з drawer ESC).
  useEffect(() => {
    if (!excelMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      setExcelMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [excelMode, setExcelMode]);

  const [stages, setStages] = useState<StageRow[]>(initialStages);
  const [showHidden, setShowHidden] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [focusedStageId, setFocusedStageId] = useState<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{
    kind: "info" | "ok" | "err";
    text: string;
  } | null>(null);

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
  const [restructureOpen, setRestructureOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [dirtyStageIds, setDirtyStageIds] = useState<Set<string>>(() => new Set());
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [, startTransition] = useTransition();

  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [costFilter, setCostFilter] = useState<"all" | "labor" | "material">("all");
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("metrum.stage-table.cost-filter");
      if (raw === "all" || raw === "labor" || raw === "material") setCostFilter(raw);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("metrum.stage-table.cost-filter", costFilter);
    } catch {}
  }, [costFilter]);
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
          costType: (s.costType as StageRow["costType"]) ?? null,
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

  const filteredStages = useMemo(() => {
    let arr = stages;
    if (hideCompleted) arr = arr.filter((s) => s.status !== "COMPLETED");
    if (costFilter !== "all") {
      const want = costFilter === "labor" ? "LABOR" : "MATERIAL";
      const byId = new Map(arr.map((s) => [s.id, s]));
      const keep = new Set<string>();
      for (const s of arr) {
        if (s.costType === want) {
          keep.add(s.id);
          // показуємо предків для контексту дерева
          let cur = s.parentStageId;
          while (cur) {
            if (keep.has(cur)) break;
            keep.add(cur);
            cur = byId.get(cur)?.parentStageId ?? null;
          }
        }
      }
      arr = arr.filter((s) => keep.has(s.id));
    }
    return arr;
  }, [stages, hideCompleted, costFilter]);

  // ── Excel-like keyboard nav: Arrow Up/Down — focus rows; Enter — open drawer;
  //    Cmd/Ctrl+C — copy focused row as TSV; Cmd/Ctrl+V — paste TSV (одну або
  //    декілька рядків — оновлює existing stages by sequential order starting
  //    from focused row).
  function showToast(kind: "info" | "ok" | "err", text: string) {
    setToast({ kind, text });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2500);
  }

  const visibleOrderedIds = useMemo(() => {
    // Порядок DOM-рядків: top-level stages → children (рекурсивно), фільтр
    // приховані/завершені.
    const byParent = new Map<string | null, StageRow[]>();
    for (const s of filteredStages) {
      const arr = byParent.get(s.parentStageId) ?? [];
      arr.push(s);
      byParent.set(s.parentStageId, arr);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    const out: string[] = [];
    const walk = (parent: string | null) => {
      const arr = byParent.get(parent) ?? [];
      for (const s of arr) {
        if (!showHidden && s.isHidden) continue;
        out.push(s.id);
        walk(s.id);
      }
    };
    walk(null);
    return out;
  }, [filteredStages, showHidden]);

  // Серіалізує етап у TSV-рядок: name<TAB>status<TAB>volume<TAB>unit<TAB>unitPrice<TAB>clientPrice
  function stageToTsv(s: StageRow): string {
    const fields = [
      stageDisplayName(s),
      s.status,
      s.factVolume ?? s.planVolume ?? "",
      s.factUnit ?? s.unit ?? "",
      s.factUnitPrice ?? s.planUnitPrice ?? "",
      s.factClientUnitPrice ?? s.planClientUnitPrice ?? "",
    ];
    return fields.map((v) => String(v ?? "")).join("\t");
  }

  // Парсить TSV-рядок назад у часткове оновлення.
  function tsvToUpdate(line: string): StageInlineUpdate {
    const cols = line.split("\t");
    const out: StageInlineUpdate = {};
    // Index map: 0=name, 1=status, 2=volume, 3=unit, 4=unitPrice, 5=clientPrice
    if (cols[1] && ["PENDING", "IN_PROGRESS", "COMPLETED"].includes(cols[1])) {
      out.status = cols[1] as StageRow["status"];
    }
    const v2 = cols[2]?.trim();
    if (v2) {
      const n = Number(v2.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) out.factVolume = n;
    }
    const v3 = cols[3]?.trim();
    if (v3) out.factUnit = v3;
    const v4 = cols[4]?.trim();
    if (v4) {
      const n = Number(v4.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) out.factUnitPrice = n;
    }
    const v5 = cols[5]?.trim();
    if (v5) {
      const n = Number(v5.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) out.factClientUnitPrice = n;
    }
    return out;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Якщо фокус у textarea/input/select — не перехоплюємо (нехай редагується).
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (target as HTMLElement).isContentEditable
      ) {
        return;
      }
      // Кеуbord-навігація працює лише коли курсор у межах таблиці етапів.
      const wrap = tableWrapRef.current;
      if (!wrap || !wrap.contains(target)) return;

      const idx = focusedStageId ? visibleOrderedIds.indexOf(focusedStageId) : -1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = idx < 0 ? 0 : Math.min(visibleOrderedIds.length - 1, idx + 1);
        const id = visibleOrderedIds[next];
        if (id) setFocusedStageId(id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = idx < 0 ? 0 : Math.max(0, idx - 1);
        const id = visibleOrderedIds[next];
        if (id) setFocusedStageId(id);
      } else if (e.key === "Enter") {
        if (focusedStageId) {
          e.preventDefault();
          openStage(focusedStageId);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        // Copy focused row → TSV
        if (focusedStageId) {
          const s = stages.find((x) => x.id === focusedStageId);
          if (s) {
            e.preventDefault();
            navigator.clipboard
              .writeText(stageToTsv(s))
              .then(() =>
                showToast("ok", `Рядок «${stageDisplayName(s)}» скопійовано як TSV`),
              )
              .catch(() => showToast("err", "Не вдалось скопіювати"));
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        if (focusedStageId) {
          e.preventDefault();
          navigator.clipboard
            .readText()
            .then(async (raw) => {
              if (!raw.trim()) return;
              const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
              const startIdx = visibleOrderedIds.indexOf(focusedStageId);
              if (startIdx < 0) return;
              let updated = 0;
              for (let i = 0; i < lines.length; i++) {
                const targetId = visibleOrderedIds[startIdx + i];
                if (!targetId) break;
                const update = tsvToUpdate(lines[i]);
                if (Object.keys(update).length === 0) continue;
                await inlineUpdate(targetId, update);
                updated++;
              }
              showToast("ok", `Оновлено ${updated} рядків з TSV`);
            })
            .catch((err) => {
              console.error("[stages paste] failed:", err);
              showToast("err", "Не вдалось вставити TSV");
            });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    focusedStageId,
    visibleOrderedIds,
    stages,
    openStage,
    inlineUpdate,
  ]);

  return (
    <div
      className={
        excelMode
          ? "fixed inset-0 z-[100] flex flex-col"
          : "rounded-2xl p-5"
      }
      style={{
        backgroundColor: T.panel,
        border: excelMode ? "none" : `1px solid ${T.borderSoft}`,
      }}
    >
      <div
        className={
          excelMode
            ? "sticky top-0 z-20 flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:flex-wrap"
            : "mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:flex-wrap"
        }
        style={
          excelMode
            ? {
                backgroundColor: T.panel,
                borderBottom: `1px solid ${T.borderStrong}`,
              }
            : undefined
        }
      >
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
          <span
            aria-hidden
            className="hidden sm:inline-block h-5 w-px"
            style={{ backgroundColor: T.borderSoft }}
          />
          <CostFilterSwitch value={costFilter} onChange={setCostFilter} />
          <button
            type="button"
            onClick={() => setAiAssistantOpen(true)}
            title="AI помічник: розпізнає роботи й матеріали з вільного тексту"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: T.violet,
              color: "white",
            }}
          >
            <Sparkles size={12} />
            <span className="hidden sm:inline">AI помічник</span>
            <span className="sm:hidden">AI</span>
          </button>
          <button
            type="button"
            onClick={() => setExcelMode(!excelMode)}
            title={excelMode ? "Вийти з Excel-режиму (Esc)" : "Excel-режим: повноекранна таблиця"}
            className="hidden lg:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: excelMode ? T.accentPrimarySoft : T.panelSoft,
              color: excelMode ? T.accentPrimary : T.textSecondary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            {excelMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            {excelMode ? "Згорнути" : "Excel-режим"}
          </button>
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
                  <OverflowItem
                    icon={<Sparkles size={13} />}
                    label="AI: побудувати дерево"
                    onClick={() => {
                      setRestructureOpen(true);
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowItem
                    icon={<Sparkles size={13} />}
                    label="Позначити роботи / матеріали"
                    onClick={() => {
                      setOverflowOpen(false);
                      void (async () => {
                        try {
                          const res = await fetch(
                            `/api/admin/projects/${projectId}/stages/backfill-cost-type`,
                            { method: "POST" },
                          );
                          const json = (await res.json()) as
                            | {
                                data: {
                                  scanned: number;
                                  labor: number;
                                  material: number;
                                  skipped: number;
                                };
                              }
                            | { error: string };
                          if (!res.ok || !("data" in json)) {
                            showToast(
                              "err",
                              "error" in json
                                ? json.error
                                : `HTTP ${res.status}`,
                            );
                            return;
                          }
                          showToast(
                            "ok",
                            `Класифіковано: ${json.data.labor} робіт + ${json.data.material} матеріалів (пропущено ${json.data.skipped})`,
                          );
                          await refetch();
                        } catch (err) {
                          showToast(
                            "err",
                            err instanceof Error ? err.message : String(err),
                          );
                        }
                      })();
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
      <div
        ref={tableWrapRef}
        tabIndex={0}
        onClick={(e) => {
          // Підхопити focusedStageId з кліку на рядок (на додачу до openStage,
          // що теж викликається завдяки propagation з <tr>).
          const target = e.target as HTMLElement | null;
          const tr = target?.closest("tr[data-stage-id]") as HTMLElement | null;
          const id = tr?.getAttribute("data-stage-id");
          if (id) setFocusedStageId(id);
        }}
        className={
          excelMode
            ? "hidden lg:block outline-none flex-1 min-h-0 overflow-auto px-4 py-3"
            : "hidden lg:block outline-none"
        }
      >
        <StageTable
          stages={filteredStages}
          selectedStageId={focusedStageId}
          onStageClick={(id) => {
            setFocusedStageId(id);
            openStage(id);
          }}
          onInlineUpdate={inlineUpdate}
          onAddChild={addChild}
          onDelete={deleteStage}
          candidates={candidates}
          showHidden={showHidden}
          dirtyStageIds={dirtyStageIds}
          viewMode={viewMode}
          onMoveStage={moveStage}
          excelMode={excelMode}
        />
        {!excelMode && (
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
        )}
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
      {restructureOpen && (
        <AiRestructureModal
          projectId={projectId}
          stages={stages.map((s) => ({
            id: s.id,
            name: stageDisplayName(s),
          }))}
          onClose={() => setRestructureOpen(false)}
          onApplied={refetch}
        />
      )}
      <PublishFinanceDialog
        projectId={projectId}
        open={publishOpen}
        stages={stages}
        onClose={() => setPublishOpen(false)}
        onPublished={onPublished}
      />
      <StagesAiAssistant
        projectId={projectId}
        open={aiAssistantOpen}
        onClose={() => setAiAssistantOpen(false)}
        stages={stages}
        onApplied={async () => {
          await refetch();
        }}
      />
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-lg px-3 py-2 text-[12px] font-medium shadow-lg"
          style={{
            backgroundColor:
              toast.kind === "ok"
                ? T.success
                : toast.kind === "err"
                  ? T.danger
                  : T.accentPrimary,
            color: "white",
          }}
          role="status"
        >
          {toast.text}
        </div>
      )}
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

type CostFilter = "all" | "labor" | "material";

const COST_FILTER_OPTIONS: {
  value: CostFilter;
  label: string;
  title: string;
  dotColor?: string;
}[] = [
  { value: "all", label: "Усі типи", title: "Показати позиції всіх типів" },
  {
    value: "labor",
    label: "Роботи",
    title: "Показати лише роботи (LABOR)",
    dotColor: "rgb(34,197,94)",
  },
  {
    value: "material",
    label: "Матеріали",
    title: "Показати лише матеріали (MATERIAL)",
    dotColor: "rgb(59,130,246)",
  },
];

function CostFilterSwitch({
  value,
  onChange,
}: {
  value: CostFilter;
  onChange: (v: CostFilter) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-lg p-0.5"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {COST_FILTER_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition"
            style={{
              backgroundColor: active ? T.panel : "transparent",
              color: active ? T.accentPrimary : T.textMuted,
              boxShadow: active ? `0 1px 2px ${T.borderSoft}` : undefined,
              fontWeight: active ? 600 : 500,
            }}
          >
            {opt.dotColor && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: opt.dotColor }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
