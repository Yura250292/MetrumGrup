"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Table as TableIcon, Plus, FolderPlus } from "lucide-react";
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
import type { ProjectRow } from "./projects-types";

type Mode = "cards" | "table";
const MODES: Mode[] = ["cards", "table"];

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
}) {
  const isDesktop = useIsDesktop();
  const initial: Mode = isDesktop ? "table" : "cards";
  const [mode, setMode] = usePersistedViewMode<Mode>("projects", MODES, initial);

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
        subtitle={`${totalCount} ${
          totalCount === 1 ? "проєкт" : "проєктів"
        } · ${activeCount} активних${
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
            ]}
          />
        }
        rightSlot={
          <button
            type="button"
            onClick={() => setShowCreateFolder(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
            title="Нова папка"
          >
            <FolderPlus size={14} />
            Папка
          </button>
        }
      />
      {mode === "cards" && (
        <ProjectsCards
          projects={projects}
          canDelete={canDelete}
          currentFolderId={currentFolderId}
          folders={folders}
          isSuperAdmin={isSuperAdmin}
          showFinance={showFinance}
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
