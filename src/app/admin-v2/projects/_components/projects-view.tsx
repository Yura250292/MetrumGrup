"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Table as TableIcon, Rows3, Plus } from "lucide-react";
import {
  PageToolbar,
  ViewModeSwitcher,
  usePersistedViewMode,
  SavedViewsMenu,
  useSavedViews,
} from "@/components/shared/page-toolbar";
import { ProjectsCards } from "./projects-cards";
import { ProjectsTable } from "./projects-table";
import { ProjectsCompact } from "./projects-compact";
import type { ProjectRow } from "./projects-types";

type Mode = "cards" | "table" | "compact";
const MODES: Mode[] = ["cards", "table", "compact"];

type ProjectsViewState = { mode: Mode };

export function ProjectsView({
  projects,
  canDelete,
  currentFolderId,
  totalCount,
  activeCount,
}: {
  projects: ProjectRow[];
  canDelete: boolean;
  currentFolderId: string | null;
  totalCount: number;
  activeCount: number;
}) {
  const isDesktop = useIsDesktop();
  const initial: Mode = isDesktop ? "table" : "cards";
  const [mode, setMode] = usePersistedViewMode<Mode>("projects", MODES, initial);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const { views, save: saveView, remove: removeView } = useSavedViews<ProjectsViewState>("projects");

  return (
    <div className="flex flex-col gap-3">
      <PageToolbar
        title="Проєкти"
        subtitle={`${totalCount} ${totalCount === 1 ? "проєкт" : "проєктів"} · ${activeCount} активних`}
        primaryAction={{
          label: "Новий проєкт",
          href: "/admin-v2/projects/new",
          icon: <Plus size={16} />,
        }}
        viewMode={
          <ViewModeSwitcher<Mode>
            value={mode}
            onChange={(v) => {
              setMode(v);
              setActiveViewId(null);
            }}
            ariaLabel="Режим перегляду"
            options={[
              { value: "table", label: "Таблиця", icon: TableIcon },
              { value: "cards", label: "Картки", icon: LayoutGrid },
              { value: "compact", label: "Компакт", icon: Rows3 },
            ]}
          />
        }
        rightSlot={
          <SavedViewsMenu<ProjectsViewState>
            views={views}
            activeId={activeViewId}
            onApply={(state, id) => {
              setMode(state.mode);
              setActiveViewId(id);
            }}
            onSave={(name) => {
              const v = saveView(name, { mode });
              setActiveViewId(v.id);
            }}
            onDelete={(id) => {
              removeView(id);
              if (activeViewId === id) setActiveViewId(null);
            }}
          />
        }
      />
      {mode === "cards" && (
        <ProjectsCards
          projects={projects}
          canDelete={canDelete}
          currentFolderId={currentFolderId}
        />
      )}
      {mode === "table" && <ProjectsTable projects={projects} />}
      {mode === "compact" && <ProjectsCompact projects={projects} />}
    </div>
  );
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}
