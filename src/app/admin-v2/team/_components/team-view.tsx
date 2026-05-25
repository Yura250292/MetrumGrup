"use client";

import { TaskPeopleGlobal } from "@/app/admin-v2/me/_components/task-people-global";
import { useDrillDown } from "@/components/drawer/use-drill-down";

export function TeamView() {
  const drawer = useDrillDown();
  return (
    <TaskPeopleGlobal
      onOpenDrawer={(taskId) => drawer.open({ type: "task", id: taskId })}
    />
  );
}
