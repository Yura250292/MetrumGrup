"use client";

import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectStatus } from "@prisma/client";
import { FolderCard } from "@/components/folders/FolderCard";
import type { FolderItem } from "@/hooks/useFolders";
import type { ProjectRow } from "./projects-types";
import { ProjectCardV2 } from "./project-card-v2";
import { motion } from "framer-motion";
import { gridStagger, flyInUp, useReducedMotionVariants } from "@/lib/motion";

// canViewFinance is server-only; signal showFinance from page server side
// via prop. Default to true if not provided to maintain previous behaviour.

export function ProjectsCards({
  projects,
  canDelete,
  currentFolderId,
  folders = [],
  isSuperAdmin,
  showFinance = false,
  currentUserId,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
}: {
  projects: ProjectRow[];
  canDelete: boolean;
  currentFolderId: string | null;
  folders?: FolderItem[];
  isSuperAdmin?: boolean;
  showFinance?: boolean;
  currentUserId: string;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  onMoveFolder?: (id: string) => void;
}) {
  const animateUntil = Math.min(projects.length + folders.length, 24);
  const containerVariants = useReducedMotionVariants(gridStagger);
  const itemVariants = useReducedMotionVariants(flyInUp);

  return (
    <motion.section
      // Унифікований grid: папки + проєкти в одній сітці.
      className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {folders.map((f, i) =>
        i < animateUntil ? (
          <motion.div key={`folder-${f.id}`} variants={itemVariants}>
            <FolderCard
              folder={f}
              href={`/admin-v2/projects?folderId=${f.id}`}
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
              onMove={onMoveFolder}
              bypassLocks={isSuperAdmin}
            />
          </motion.div>
        ) : (
          <FolderCard
            key={`folder-${f.id}`}
            folder={f}
            href={`/admin-v2/projects?folderId=${f.id}`}
            onRename={onRenameFolder}
            onDelete={onDeleteFolder}
            onMove={onMoveFolder}
            bypassLocks={isSuperAdmin}
          />
        ),
      )}
      {projects.map((p, i) => {
        const animIdx = i + folders.length;
        return animIdx < animateUntil ? (
          <motion.div key={p.id} variants={itemVariants}>
            <ProjectCardV2
              project={p}
              canDelete={canDelete}
              currentFolderId={currentFolderId}
              showFinance={showFinance}
              currentUserId={currentUserId}
            />
          </motion.div>
        ) : (
          <ProjectCardV2
            key={p.id}
            project={p}
            canDelete={canDelete}
            currentFolderId={currentFolderId}
            showFinance={showFinance}
            currentUserId={currentUserId}
          />
        );
      })}
    </motion.section>
  );
}

// Legacy ProjectCard removed — replaced by ProjectCardV2 from ./project-card-v2.
// StatusBadge re-exported for any external usage (e.g. projects-table).

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const label = PROJECT_STATUS_LABELS[status] ?? status;
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: T.panelElevated, fg: T.textMuted },
    ACTIVE: { bg: T.successSoft, fg: T.success },
    ON_HOLD: { bg: T.warningSoft, fg: T.warning },
    COMPLETED: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    CANCELLED: { bg: T.dangerSoft, fg: T.danger },
  };
  const c = colors[status] ?? colors.DRAFT;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}
