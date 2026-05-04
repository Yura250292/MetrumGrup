"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Hand } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { CrossStagesTable } from "./cross-stages-table";
import { StageMaterialsPanel } from "./stage-materials-panel";
import type { ProjectOverview, StageNode, ToggleState } from "./types";

const TOGGLES_KEY = "metrum:cross-stages:toggles";
const SPLIT_KEY = "metrum:cross-stages:split";

type Props = {
  currentUserId: string | null;
};

function ToggleChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 14,
        border: `1px solid ${on ? T.accentPrimary : T.borderSoft}`,
        background: on ? T.accentPrimarySoft : T.panel,
        color: on ? T.accentPrimary : T.textMuted,
        fontSize: 11,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: on ? T.accentPrimary : T.borderStrong,
        }}
      />
      {children}
    </button>
  );
}

function loadToggles(): ToggleState {
  if (typeof window === "undefined") {
    return { hideCompleted: false, hideFinance: false, hideDates: false };
  }
  try {
    const raw = window.localStorage.getItem(TOGGLES_KEY);
    if (raw) return JSON.parse(raw) as ToggleState;
  } catch {}
  return { hideCompleted: false, hideFinance: false, hideDates: false };
}

function loadSplit(): number {
  if (typeof window === "undefined") return 55;
  try {
    const raw = window.localStorage.getItem(SPLIT_KEY);
    if (raw) {
      const v = parseFloat(raw);
      if (!Number.isNaN(v) && v > 20 && v < 90) return v;
    }
  } catch {}
  return 55;
}

export function CrossProjectStagesView(_props: Props) {
  const [projects, setProjects] = useState<ProjectOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [pmFilter, setPmFilter] = useState<"all" | "me">("all");
  const [toggles, setToggles] = useState<ToggleState>(loadToggles);
  const [closedProjects, setClosedProjects] = useState<Set<string>>(new Set());
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{
    projectId: string;
    projectSlug: string;
    stage: StageNode;
  } | null>(null);
  const [splitPct, setSplitPct] = useState(loadSplit);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(TOGGLES_KEY, JSON.stringify(toggles));
      } catch {}
    }
  }, [toggles]);

  useEffect(() => {
    let cancelled = false;
    const url =
      pmFilter === "me" ? "/api/admin/projects/stages-overview?pm=me" : "/api/admin/projects/stages-overview";
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data: ProjectOverview[] }) => {
        if (!cancelled) {
          setProjects(j.data ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pmFilter]);

  function toggleProject(id: string) {
    setClosedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(id: string) {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectStage(projectId: string, stage: StageNode) {
    const p = projects.find((x) => x.id === projectId);
    if (!p) return;
    setSelected({ projectId, projectSlug: p.slug, stage });
  }

  // Split-pane resize.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      if (pct > 20 && pct < 90) setSplitPct(pct);
    }
    function onUp() {
      if (dragging.current) {
        dragging.current = false;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(SPLIT_KEY, String(splitPct));
          } catch {}
        }
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [splitPct]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* FilterBar */}
      <div
        style={{
          background: T.panel,
          borderBottom: `1px solid ${T.borderSoft}`,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: T.textMuted,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Вигляд:
        </span>
        <button
          type="button"
          onClick={() => setPmFilter("all")}
          style={chipStyle(pmFilter === "all")}
        >
          Всі
        </button>
        <button
          type="button"
          onClick={() => setPmFilter("me")}
          style={chipStyle(pmFilter === "me")}
        >
          Мої проєкти
        </button>
        <div style={{ width: 1, height: 16, background: T.borderSoft, margin: "0 4px" }} />
        <ToggleChip
          on={!toggles.hideCompleted}
          onClick={() => setToggles({ ...toggles, hideCompleted: !toggles.hideCompleted })}
        >
          Завершені етапи
        </ToggleChip>
        <ToggleChip
          on={!toggles.hideFinance}
          onClick={() => setToggles({ ...toggles, hideFinance: !toggles.hideFinance })}
        >
          Фінанси
        </ToggleChip>
        <ToggleChip
          on={!toggles.hideDates}
          onClick={() => setToggles({ ...toggles, hideDates: !toggles.hideDates })}
        >
          Терміни
        </ToggleChip>
      </div>

      {/* Split layout */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: `${splitPct}%`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {loading ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: T.textMuted,
              }}
            >
              <Loader2 size={16} className="animate-spin" />
              <span style={{ fontSize: 12 }}>Завантаження...</span>
            </div>
          ) : (
            <CrossStagesTable
              projects={projects}
              toggles={toggles}
              selectedStageId={selected?.stage.id ?? null}
              onSelectStage={selectStage}
              closedProjects={closedProjects}
              closedGroups={closedGroups}
              onToggleProject={toggleProject}
              onToggleGroup={toggleGroup}
            />
          )}
        </div>

        <div
          onMouseDown={() => {
            dragging.current = true;
          }}
          style={{
            height: 5,
            background: T.borderSoft,
            cursor: "row-resize",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 28,
              height: 2,
              background: T.borderStrong,
              borderRadius: 1,
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: T.panelSoft,
            minHeight: 80,
          }}
        >
          {selected ? (
            <StageMaterialsPanel
              projectId={selected.projectId}
              projectSlug={selected.projectSlug}
              stage={selected.stage}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                color: T.textMuted,
              }}
            >
              <Hand size={20} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: 12 }}>Обери етап щоб побачити матеріали</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function chipStyle(on: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 14,
    border: `1px solid ${on ? T.accentPrimary : T.borderSoft}`,
    background: on ? T.accentPrimarySoft : T.panel,
    color: on ? T.accentPrimary : T.textMuted,
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}
