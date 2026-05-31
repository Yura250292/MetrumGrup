"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Table as TableIcon,
  Plus,
  FolderPlus,
  Upload,
  Download,
  GanttChartSquare,
} from "lucide-react";
import {
  PageToolbar,
  ViewModeSwitcher,
  usePersistedViewMode,
} from "@/components/shared/page-toolbar";
import { FolderBreadcrumb } from "@/components/folders/FolderBreadcrumb";
import { CreateFolderDialog } from "@/components/folders/CreateFolderDialog";
import { MoveToFolderDialog } from "@/components/folders/MoveToFolderDialog";
import {
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  type FolderItem,
  type BreadcrumbItem,
} from "@/hooks/useFolders";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ProjectsCards } from "./projects-cards";
import { ProjectsTable } from "./projects-table";
import { ProjectsTimeline } from "./projects-timeline";
import {
  ProjectsFilterBar,
  applyProjectsFilterSort,
  type StatusFilter,
  type SortMode,
  type Preset,
} from "./projects-filter-bar";
import type { ProjectRow } from "./projects-types";

type Mode = "cards" | "table" | "timeline";
const MODES: Mode[] = ["cards", "table", "timeline"];

export function ProjectsView({
  projects,
  canDelete,
  currentFolderId,
  totalCount,
  activeCount,
  folders,
  breadcrumbs,
  isSuperAdmin,
  showFinance = false,
  currentUserId,
  firmName,
}: {
  projects: ProjectRow[];
  canDelete: boolean;
  currentFolderId: string | null;
  totalCount: number;
  activeCount: number;
  folders: FolderItem[];
  breadcrumbs: BreadcrumbItem[];
  isSuperAdmin?: boolean;
  showFinance?: boolean;
  currentUserId: string;
  /** Назва поточної фірми ("Metrum Group" / "Metrum Studio") для chip-у. */
  firmName: string | null;
}) {
  const isDesktop = useIsDesktop();
  const initial: Mode = isDesktop ? "table" : "cards";
  const [mode, setMode] = usePersistedViewMode<Mode>("projects", MODES, initial);

  // Client-side filter+sort стан. UX: всі дані вже в RSC payload, тому
  // мить-фільтрація без round-trip. Зміняти URL не варто — це не виглядає
  // як "navigation event" а скоріше як local view-state.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const filtered = applyProjectsFilterSort(
    projects,
    statusFilter,
    typeFilter,
    managerFilter,
    activePreset,
    currentUserId,
    sortMode,
  );

  // Toggle preset: повторний клік знімає, інший — переключає.
  const togglePreset = (preset: Preset) => {
    setActivePreset((cur) => (cur === preset ? null : preset));
  };

  // Folder mutations (раніше жили у ProjectFoldersClient — переїхали сюди
  // щоб папки + проєкти жили в єдиному гріді).
  const router = useRouter();
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const createMutation = useCreateFolder();
  const updateMutation = useUpdateFolder();
  const deleteMutation = useDeleteFolder();

  const handleCreateFolder = (data: { name: string; color: string | null }) => {
    createMutation.mutate(
      {
        domain: "PROJECT",
        name: data.name,
        parentId: currentFolderId,
        color: data.color,
      },
      {
        onSuccess: () => {
          setShowCreateFolder(false);
          router.refresh();
        },
      },
    );
  };

  const handleRenameFolder = (id: string, name: string) => {
    updateMutation.mutate(
      { id, name },
      { onSuccess: () => router.refresh() },
    );
  };

  const handleDeleteFolder = (id: string) => {
    if (!confirm("Видалити папку? Проєкти всередині повернуться в корінь."))
      return;
    deleteMutation.mutate(id, {
      onSuccess: () => router.refresh(),
      onError: (err) =>
        alert(err instanceof Error ? err.message : "Помилка видалення"),
    });
  };

  const handleMoveFolderTo = (targetParentId: string | null) => {
    if (!moveFolderId) return;
    updateMutation.mutate(
      { id: moveFolderId, parentId: targetParentId },
      {
        onSuccess: () => {
          setMoveFolderId(null);
          router.refresh();
        },
        onError: (err) =>
          alert(err instanceof Error ? err.message : "Помилка переміщення"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Bread­crumbs зверху — завжди при глибині > root */}
      {breadcrumbs.length > 0 && (
        <FolderBreadcrumb
          breadcrumbs={breadcrumbs}
          basePath="/admin-v2/projects"
          rootLabel="Усі проєкти"
        />
      )}

      <PageToolbar
        title="Проєкти"
        titleBadge={
          firmName ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{
                backgroundColor: T.accentPrimarySoft,
                color: T.accentPrimary,
              }}
              title={`Поточна фірма: ${firmName}`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: T.accentPrimary }}
              />
              {firmName}
            </span>
          ) : null
        }
        subtitle={`Управління будівельними проектами · ${totalCount} ${
          totalCount === 1 ? "проєкт" : "проєктів"
        } · ${activeCount} в роботі${
          folders.length > 0 ? ` · ${folders.length} папок` : ""
        }`}
        primaryAction={{
          label: "Новий проєкт",
          href: "/admin-v2/projects/new",
          icon: <Plus size={16} />,
        }}
        viewMode={
          <ViewModeSwitcher<Mode>
            value={mode}
            onChange={setMode}
            ariaLabel="Режим перегляду"
            options={[
              { value: "table", label: "Таблиця", icon: TableIcon },
              { value: "cards", label: "Картки", icon: LayoutGrid },
              { value: "timeline", label: "Шкала", icon: GanttChartSquare },
            ]}
          />
        }
        rightSlot={
          <div className="flex items-center gap-1.5">
            {/* Експорт / Імпорт — feature flagged off поки API не готове. */}
            <SecondaryButton
              icon={<Download size={14} />}
              label="Експорт"
              disabled
              title="Експорт у CSV — скоро"
            />
            <SecondaryButton
              icon={<Upload size={14} />}
              label="Імпорт"
              disabled
              title="Імпорт з CSV — скоро"
            />
            <SecondaryButton
              icon={<FolderPlus size={14} />}
              label="Папка"
              onClick={() => setShowCreateFolder(true)}
              title="Нова папка"
            />
          </div>
        }
      />

      {/* Filter+sort bar поверх grid — для cards і timeline view (в table свої сорти). */}
      {(mode === "cards" || mode === "timeline") && projects.length > 0 && (
        <ProjectsFilterBar
          projects={projects}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          managerFilter={managerFilter}
          onManagerChange={setManagerFilter}
          sortMode={sortMode}
          onSortChange={setSortMode}
          currentUserId={currentUserId}
          activePreset={activePreset}
          onPresetClick={togglePreset}
        />
      )}

      {mode === "cards" && (
        <ProjectsCards
          projects={filtered}
          canDelete={canDelete}
          currentFolderId={currentFolderId}
          folders={folders}
          isSuperAdmin={isSuperAdmin}
          showFinance={showFinance}
          currentUserId={currentUserId}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveFolder={(id) => setMoveFolderId(id)}
        />
      )}
      {mode === "table" && (
        <ProjectsTable
          projects={projects}
          folders={folders}
          isSuperAdmin={isSuperAdmin}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveFolder={(id) => setMoveFolderId(id)}
        />
      )}
      {mode === "timeline" && <ProjectsTimeline projects={filtered} />}

      <CreateFolderDialog
        open={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onSubmit={handleCreateFolder}
        loading={createMutation.isPending}
      />

      <MoveToFolderDialog
        open={moveFolderId !== null}
        onClose={() => setMoveFolderId(null)}
        domain="PROJECT"
        currentFolderId={
          moveFolderId
            ? folders.find((f) => f.id === moveFolderId)?.parentId ?? null
            : null
        }
        excludeSubtreeOf={moveFolderId ?? undefined}
        itemCount={1}
        title="Перемістити папку"
        loading={updateMutation.isPending}
        onMove={handleMoveFolderTo}
      />
    </div>
  );
}

function SecondaryButton({
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        backgroundColor: T.panelElevated,
        color: T.textPrimary,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {icon}
      {label}
    </button>
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
