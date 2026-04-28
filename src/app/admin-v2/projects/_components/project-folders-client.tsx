"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { FolderCard } from "@/components/folders/FolderCard";
import { FolderBreadcrumb } from "@/components/folders/FolderBreadcrumb";
import { CreateFolderDialog } from "@/components/folders/CreateFolderDialog";
import { MoveToFolderDialog } from "@/components/folders/MoveToFolderDialog";
import { motion } from "framer-motion";
import {
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  useMoveItems,
  type FolderItem,
  type BreadcrumbItem,
} from "@/hooks/useFolders";

type Props = {
  folders: FolderItem[];
  breadcrumbs: BreadcrumbItem[];
  currentFolderId: string | null;
  isSuperAdmin?: boolean;
};

export function ProjectFoldersClient({
  folders,
  breadcrumbs,
  currentFolderId,
  isSuperAdmin,
}: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const createMutation = useCreateFolder();
  const updateMutation = useUpdateFolder();
  const deleteMutation = useDeleteFolder();

  const handleCreate = (data: { name: string; color: string | null }) => {
    createMutation.mutate(
      {
        domain: "PROJECT",
        name: data.name,
        parentId: currentFolderId,
        color: data.color,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          router.refresh();
        },
      },
    );
  };

  const handleRename = (id: string, name: string) => {
    updateMutation.mutate(
      { id, name },
      { onSuccess: () => router.refresh() },
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm("Видалити папку? Проєкти всередині повернуться в корінь.")) return;
    deleteMutation.mutate(id, {
      onSuccess: () => router.refresh(),
      onError: (err) => alert(err instanceof Error ? err.message : "Помилка видалення"),
    });
  };

  const handleMoveFolder = (targetParentId: string | null) => {
    if (!moveFolderId) return;
    updateMutation.mutate(
      { id: moveFolderId, parentId: targetParentId },
      {
        onSuccess: () => {
          setMoveFolderId(null);
          router.refresh();
        },
        onError: (err) => alert(err instanceof Error ? err.message : "Помилка переміщення"),
      },
    );
  };

  return (
    <>
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <FolderBreadcrumb
          breadcrumbs={breadcrumbs}
          basePath="/admin-v2/projects"
          rootLabel="Усі проєкти"
        />
      )}

      {/* Folder grid + create button */}
      {(folders.length > 0 || currentFolderId !== null) && (
        <motion.div
          layout
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.06,
                delayChildren: 0.05,
              },
            },
          }}
          className="grid grid-cols-2 xl:grid-cols-4 gap-3"
        >
          {folders.map((f) => (
            <motion.div
              key={f.id}
              layout
              variants={{
                hidden: {
                  opacity: 0,
                  y: 24,
                  scale: 0.88,
                  filter: "blur(6px)",
                },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  filter: "blur(0px)",
                  transition: {
                    type: "spring",
                    stiffness: 200,
                    damping: 24,
                    mass: 0.9,
                  },
                },
              }}
              whileHover={{
                y: -3,
                scale: 1.018,
                transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
              }}
            >
              <FolderCard
                folder={f}
                href={`/admin-v2/projects?folderId=${f.id}`}
                onRename={handleRename}
                onDelete={handleDelete}
                onMove={(id) => setMoveFolderId(id)}
                bypassLocks={isSuperAdmin}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create folder button */}
      <button
        onClick={() => setShowCreate(true)}
        className="flex items-center gap-2 text-[12px] font-semibold transition hover:opacity-80"
        style={{ color: T.accentPrimary }}
      >
        <FolderPlus size={14} /> Нова папка
      </button>

      <CreateFolderDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
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
        onMove={handleMoveFolder}
      />
    </>
  );
}

/** Wrapper for move-to-folder action on individual projects */
export function MoveProjectButton({
  projectId,
  currentFolderId,
}: {
  projectId: string;
  currentFolderId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const moveMutation = useMoveItems();

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="rounded-lg px-2 py-1 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: T.panelElevated, color: T.accentPrimary }}
        title="Перемістити в папку"
      >
        Папка
      </button>

      <MoveToFolderDialog
        open={open}
        onClose={() => setOpen(false)}
        domain="PROJECT"
        currentFolderId={currentFolderId}
        itemCount={1}
        loading={moveMutation.isPending}
        onMove={(targetFolderId) => {
          moveMutation.mutate(
            {
              domain: "PROJECT",
              itemIds: [projectId],
              targetFolderId,
            },
            {
              onSuccess: () => {
                setOpen(false);
                router.refresh();
              },
            },
          );
        }}
      />
    </>
  );
}
