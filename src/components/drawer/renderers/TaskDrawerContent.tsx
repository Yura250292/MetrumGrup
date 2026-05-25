"use client";

import { useSession } from "next-auth/react";
import { SelfContainedTaskDrawer } from "@/app/admin-v2/me/_components/task-drawer-shared";
import { useDrillDown } from "../use-drill-down";
import type { RendererProps } from "../types";

/**
 * Подія, яку drawer кидає у window після успішних мутацій (edit/delete/log).
 * Слухачі (me-dashboard, team-view) ловлять і перезавантажують свої списки.
 */
export const TASK_UPDATED_EVENT = "metrum:task-updated";

export type TaskUpdatedDetail = { taskId: string };

export function TaskDrawerContent({ id }: RendererProps) {
  const { data: session } = useSession();
  const drawer = useDrillDown();

  return (
    <SelfContainedTaskDrawer
      embedded
      taskId={id}
      currentUserId={session?.user?.id}
      currentUserRole={session?.user?.role}
      onClose={() => drawer.closeAll()}
      onUpdate={() => {
        window.dispatchEvent(
          new CustomEvent<TaskUpdatedDetail>(TASK_UPDATED_EVENT, {
            detail: { taskId: id },
          }),
        );
      }}
    />
  );
}
