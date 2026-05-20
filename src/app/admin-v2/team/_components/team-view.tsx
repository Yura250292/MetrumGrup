"use client";

import { useState } from "react";
import { TaskPeopleGlobal } from "@/app/admin-v2/me/_components/task-people-global";
import { SelfContainedTaskDrawer } from "@/app/admin-v2/me/_components/task-drawer-shared";

/**
 * Клієнтський wrapper: рендерить by-people view і керує drawer'ом, коли
 * клікають по задачі. Сесія/роль drawer'у не передаються — це view "тільки
 * на читання+коментарі"; видалення доступне з /admin-v2/me.
 */
export function TeamView() {
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  return (
    <>
      <TaskPeopleGlobal onOpenDrawer={setDrawerTaskId} />
      {drawerTaskId && (
        <SelfContainedTaskDrawer
          taskId={drawerTaskId}
          onClose={() => setDrawerTaskId(null)}
          onUpdate={() => {
            // no-op: by-people fetch не reactive, drawer оновить себе сам
          }}
        />
      )}
    </>
  );
}
