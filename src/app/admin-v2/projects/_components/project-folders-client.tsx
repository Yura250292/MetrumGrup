"use client";

// `ProjectFoldersClient` функцію перенесено у `ProjectsView` (folders + projects
// тепер живуть у єдиному гріді з спільним toolbar/breadcrumb). Тут лишається
// лише `MoveProjectButton`, що використовується картками проєктів.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MoveToFolderDialog } from "@/components/folders/MoveToFolderDialog";
import { useMoveItems } from "@/hooks/useFolders";

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
