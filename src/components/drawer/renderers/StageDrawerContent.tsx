"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Package } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { stageDisplayName } from "@/lib/constants";
import { DrawerLayout } from "../layouts/DrawerLayout";
import { DrawerHeader } from "../layouts/DrawerHeader";
import { DrawerBody } from "../layouts/DrawerBody";
import { useDrillDown } from "../use-drill-down";
import { useIsMobile } from "../hooks/use-is-mobile";
import { StageDetailContent } from "@/app/admin-v2/projects/[id]/_components/stage-detail-drawer";
import { StageMaterialsContent } from "@/app/admin-v2/projects/[id]/_components/stage-materials-popup";
import type { StageRow } from "@/app/admin-v2/projects/[id]/_components/stage-table";
import type { ResponsibleCandidate } from "@/app/admin-v2/projects/[id]/_components/stages-section";
import type { RendererProps } from "../types";

/**
 * Подія для синхронізації з parent-таблицею (stages-section) після PATCH/POST
 * з drawer-форми. Парент слухає → робить власний refetch.
 */
export const STAGE_UPDATED_EVENT = "metrum:stage-updated";
export type StageUpdatedDetail = { projectId: string; stageId: string };

type SubTab = "details" | "materials";
const SUBTAB_LS_KEY = "metrum.stage-drawer.subtab";
const ID_SEPARATOR = "__";

/**
 * Композитний id формату `${projectId}__${stageId}` потрібен бо drawer-registry
 * передає лише один `id`. Сепаратор `__` валідний в `url-state.ts` ID_RE.
 */
export function buildStageDrawerId(projectId: string, stageId: string): string {
  return `${projectId}${ID_SEPARATOR}${stageId}`;
}

function parseStageDrawerId(raw: string): [string, string] | null {
  const idx = raw.indexOf(ID_SEPARATOR);
  if (idx <= 0 || idx === raw.length - ID_SEPARATOR.length) return null;
  const projectId = raw.slice(0, idx);
  const stageId = raw.slice(idx + ID_SEPARATOR.length);
  if (!projectId || !stageId) return null;
  return [projectId, stageId];
}

type ProjectStageApi = Record<string, unknown> & {
  id: string;
  parentStageId: string | null;
  responsibleUser?: { id: string; name: string } | null;
};

type ProjectPayload = {
  data?: {
    id: string;
    title: string;
    stages?: ProjectStageApi[];
  };
  responsibleCandidates?: ResponsibleCandidate[];
};

export function StageDrawerContent({ id }: RendererProps) {
  const isMobile = useIsMobile();
  const drawer = useDrillDown();
  const parsed = parseStageDrawerId(id);

  const [tab, setTab] = useState<SubTab>("details");
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SUBTAB_LS_KEY);
      if (raw === "details" || raw === "materials") setTab(raw);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SUBTAB_LS_KEY, tab);
    } catch {}
  }, [tab]);

  const [stage, setStage] = useState<StageRow | null>(null);
  const [candidates, setCandidates] = useState<ResponsibleCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectId = parsed?.[0] ?? "";
  const stageId = parsed?.[1] ?? "";

  const refetch = useCallback(async () => {
    if (!projectId || !stageId) return;
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(res.status === 404 ? "Проєкт не знайдено" : "Помилка завантаження");
        setStage(null);
        return;
      }
      const json = (await res.json()) as ProjectPayload;
      const raw = json.data?.stages?.find((s) => s.id === stageId);
      if (!raw) {
        setError("Етап не знайдено");
        setStage(null);
        return;
      }
      setStage(toStageRow(raw));
      setCandidates(json.responsibleCandidates ?? []);
      setError(null);
    } catch (err) {
      console.error("[stage-drawer] fetch failed", err);
      setError("Помилка мережі");
    }
  }, [projectId, stageId]);

  useEffect(() => {
    setLoading(true);
    void refetch().finally(() => setLoading(false));
  }, [refetch]);

  // Сповіщаємо breadcrumb (поки stage не завантажено — fallback з registry)
  useEffect(() => {
    if (stage) drawer.setTopBreadcrumb(stageDisplayName(stage));
  }, [stage, drawer]);

  const onChanged = useCallback(async () => {
    await refetch();
    window.dispatchEvent(
      new CustomEvent<StageUpdatedDetail>(STAGE_UPDATED_EVENT, {
        detail: { projectId, stageId },
      }),
    );
  }, [refetch, projectId, stageId]);

  const onCloseTask = useCallback(() => {
    drawer.closeAll();
  }, [drawer]);

  const subTabBar = useMemo(
    () => (
      <div
        className="sticky z-10 flex items-center gap-1 px-1 py-1.5"
        style={{
          top: 0,
          backgroundColor: T.panel,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        <SubTabButton
          active={tab === "details"}
          onClick={() => setTab("details")}
          icon={<FileText size={13} />}
          label="Деталі"
        />
        <SubTabButton
          active={tab === "materials"}
          onClick={() => setTab("materials")}
          icon={<Package size={13} />}
          label="Матеріали"
        />
      </div>
    ),
    [tab],
  );

  if (!parsed) {
    return (
      <DrawerLayout>
        <DrawerHeader isMobile={isMobile} />
        <DrawerBody>
          <p className="text-sm" style={{ color: T.danger }}>
            Невалідний ідентифікатор етапу.
          </p>
        </DrawerBody>
      </DrawerLayout>
    );
  }

  return (
    <DrawerLayout>
      <DrawerHeader isMobile={isMobile} />
      <DrawerBody>
        {loading ? (
          <div
            className="flex items-center justify-center py-12"
            style={{ color: T.textMuted }}
          >
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : error || !stage ? (
          <p className="text-sm" style={{ color: T.textMuted }}>
            {error ?? "Етап не знайдено."}
          </p>
        ) : (
          <>
            {subTabBar}
            <div className="pt-3">
              {tab === "details" ? (
                <StageDetailContent
                  projectId={projectId}
                  stage={stage}
                  candidates={candidates}
                  onChanged={onChanged}
                  onCloseTask={onCloseTask}
                />
              ) : (
                <StageMaterialsContent
                  projectId={projectId}
                  stageId={stage.id}
                  stageName={stageDisplayName(stage)}
                />
              )}
            </div>
          </>
        )}
      </DrawerBody>
    </DrawerLayout>
  );
}

export default StageDrawerContent;

function SubTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
      style={{
        backgroundColor: active ? T.accentPrimarySoft : "transparent",
        color: active ? T.accentPrimary : T.textMuted,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

function toStageRow(s: ProjectStageApi): StageRow {
  return {
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
      s.responsibleUser?.name ?? (s.responsibleName as string | null) ?? null,
    allocatedBudget: toNumOrNull(s.allocatedBudget),
    unit: (s.unit as string | null) ?? null,
    factUnit: (s.factUnit as string | null) ?? null,
    planVolume: toNumOrNull(s.planVolume),
    factVolume: toNumOrNull(s.factVolume),
    planUnitPrice: toNumOrNull(s.planUnitPrice),
    factUnitPrice: toNumOrNull(s.factUnitPrice),
    planClientUnitPrice: toNumOrNull(s.planClientUnitPrice),
    factClientUnitPrice: toNumOrNull(s.factClientUnitPrice),
    planExpense: Number(s.planExpense ?? 0),
    factExpense: Number(s.factExpense ?? 0),
    planIncome: Number(s.planIncome ?? 0),
    factIncome: Number(s.factIncome ?? 0),
  };
}
