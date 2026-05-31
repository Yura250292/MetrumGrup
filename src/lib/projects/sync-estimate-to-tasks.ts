import type { Prisma, TaskDependencyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { getOrCreateDefaultStatus } from "@/lib/tasks/defaults";
import { isEstimateToTasksSyncEnabled } from "@/lib/estimates/feature-flags";

export type EstimateToTasksResult = {
  estimateId: string;
  projectId: string;
  enabled: boolean;
  tasksCreated: number;
  tasksUpdated: number;
  tasksArchived: number;
  dependenciesCreated: number;
  dependenciesUpdated: number;
  dependenciesRemoved: number;
  warnings: string[];
  syncedAt: Date;
};

const TASK_ITEM_TYPES = new Set(["labor", "composite", "equipment"]);

type EstimateItemSlim = {
  id: string;
  description: string;
  itemType: string | null;
  plannedStart: Date | null;
  plannedDurationDays: number | null;
  plannedEnd: Date | null;
  predecessorItemId: string | null;
  dependencyType: TaskDependencyType | null;
  dependencyLagDays: number;
};

function shouldBeTask(item: EstimateItemSlim): boolean {
  if (item.itemType && TASK_ITEM_TYPES.has(item.itemType)) return true;
  if (item.itemType === "material") return false;
  return item.plannedDurationDays != null || item.predecessorItemId != null;
}

function computeEnd(item: EstimateItemSlim): Date | null {
  if (item.plannedEnd) return item.plannedEnd;
  if (item.plannedStart && item.plannedDurationDays != null) {
    const ms = item.plannedDurationDays * 24 * 60 * 60 * 1000;
    return new Date(item.plannedStart.getTime() + ms);
  }
  return null;
}

/**
 * Виявити цикл серед пар (predecessorItemId, item.id) обмежених набором
 * itemIds, що стануть Tasks. Якщо цикл знайдено — повернути шлях (для
 * діагностики у warning); інакше null.
 */
function findItemCycle(
  items: EstimateItemSlim[],
  validIds: Set<string>,
): string[] | null {
  const adj = new Map<string, string[]>();
  for (const it of items) {
    if (!it.predecessorItemId) continue;
    if (!validIds.has(it.id) || !validIds.has(it.predecessorItemId)) continue;
    const arr = adj.get(it.predecessorItemId) ?? [];
    arr.push(it.id);
    adj.set(it.predecessorItemId, arr);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const start of validIds) {
    if ((color.get(start) ?? WHITE) !== WHITE) continue;
    const stack: { node: string; phase: "enter" | "exit" }[] = [
      { node: start, phase: "enter" },
    ];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.phase === "enter") {
        color.set(frame.node, GRAY);
        frame.phase = "exit";
        for (const next of adj.get(frame.node) ?? []) {
          const c = color.get(next) ?? WHITE;
          if (c === GRAY) {
            const path = [next];
            let cur: string | undefined = frame.node;
            while (cur && cur !== next) {
              path.unshift(cur);
              cur = parent.get(cur);
            }
            path.unshift(next);
            return path;
          }
          if (c === WHITE) {
            parent.set(next, frame.node);
            stack.push({ node: next, phase: "enter" });
          }
        }
      } else {
        color.set(frame.node, BLACK);
        stack.pop();
      }
    }
  }
  return null;
}

/**
 * Синхронізує рядки кошторису у Tasks + TaskDependency.
 *
 * Передумова: `syncEstimateToStages` уже відпрацював і створив
 * ProjectStageRecord з `sourceEstimateItemId`. Цей крок використовує
 * саме ці stage-id як FK для Task.stageId.
 *
 * Прозорий no-op якщо `ESTIMATE_TO_TASKS_SYNC_ENABLED != "true"`.
 *
 * Direction: estimate = source of truth для:
 *   - title (з description)
 *   - stageId, projectId
 *   - plannedStartAt / plannedEndAt — якщо baseline НЕ заморожений
 *
 * Зберігаються user-edits:
 *   - statusId, progressPercent, actualHours, completedAt, priority
 *   - assignees, watchers, labels, customFields, description
 *
 * Orphans:
 *   - Tasks з sourceEstimateItemId якого нема в estimate (видалений рядок) → isArchived=true
 *   - TaskDependency що не відповідає поточним predecessor-полям → DELETE
 */
export async function syncEstimateItemsToTasks(
  estimateId: string,
  userId: string,
): Promise<EstimateToTasksResult> {
  const syncedAt = new Date();
  const enabled = isEstimateToTasksSyncEnabled();

  if (!enabled) {
    return {
      estimateId,
      projectId: "",
      enabled: false,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksArchived: 0,
      dependenciesCreated: 0,
      dependenciesUpdated: 0,
      dependenciesRemoved: 0,
      warnings: [],
      syncedAt,
    };
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!estimate) throw new Error(`Estimate ${estimateId} not found`);
  const projectId = estimate.projectId;

  // Зібрати всі items з обох гнізд (sections.items + плоскі items).
  const allItems: EstimateItemSlim[] = [
    ...estimate.items,
    ...estimate.sections.flatMap((s) => s.items),
  ].map((i) => ({
    id: i.id,
    description: i.description,
    itemType: i.itemType,
    plannedStart: i.plannedStart,
    plannedDurationDays: i.plannedDurationDays,
    plannedEnd: i.plannedEnd,
    predecessorItemId: i.predecessorItemId,
    dependencyType: i.dependencyType,
    dependencyLagDays: i.dependencyLagDays,
  }));

  const warnings: string[] = [];

  // Фільтр: які стають Tasks.
  const taskItems = allItems.filter(shouldBeTask);
  const taskItemIds = new Set(taskItems.map((i) => i.id));

  // Cycle-check ПЕРЕД будь-яким DB-write.
  const cycle = findItemCycle(taskItems, taskItemIds);
  if (cycle) {
    throw new Error(
      `Cycle detected in estimate ${estimateId} predecessor graph: ${cycle.join(" → ")}`,
    );
  }

  // Resolve stage-id для кожного task-item: маємо sourceEstimateItemId на
  // ProjectStageRecord (створює syncEstimateToStages раніше).
  const stages = taskItemIds.size
    ? await prisma.projectStageRecord.findMany({
        where: {
          projectId,
          sourceEstimateItemId: { in: Array.from(taskItemIds) },
        },
        select: { id: true, sourceEstimateItemId: true },
      })
    : [];
  const stageByItemId = new Map<string, string>();
  for (const s of stages) {
    if (s.sourceEstimateItemId) stageByItemId.set(s.sourceEstimateItemId, s.id);
  }

  // Resolve default statusId (раз на проєкт).
  const defaultStatus = await getOrCreateDefaultStatus(projectId);

  // Існуючі Tasks які вже привʼязані до цього estimate-у — для upsert/archive.
  const existingTasks = await prisma.task.findMany({
    where: {
      projectId,
      sourceEstimateItemId: { in: allItems.map((i) => i.id) },
    },
    select: {
      id: true,
      sourceEstimateItemId: true,
      statusId: true,
      plannedStartAt: true,
      plannedEndAt: true,
      baselineFrozenAt: true,
      isArchived: true,
      stageId: true,
      title: true,
    },
  });
  const taskByItemId = new Map<string, (typeof existingTasks)[number]>();
  for (const t of existingTasks) {
    if (t.sourceEstimateItemId) taskByItemId.set(t.sourceEstimateItemId, t);
  }

  let tasksCreated = 0;
  let tasksUpdated = 0;
  let tasksArchived = 0;
  let dependenciesCreated = 0;
  let dependenciesUpdated = 0;
  let dependenciesRemoved = 0;

  await prisma.$transaction(async (tx) => {
    // Crete/update Tasks.
    for (const item of taskItems) {
      const stageId = stageByItemId.get(item.id);
      if (!stageId) {
        warnings.push(
          `Item ${item.id} (${item.description}) skipped: no matching ProjectStageRecord. Run syncEstimateToStages first.`,
        );
        continue;
      }
      const end = computeEnd(item);
      const existing = taskByItemId.get(item.id);

      if (!existing) {
        await tx.task.create({
          data: {
            projectId,
            stageId,
            statusId: defaultStatus.id,
            title: item.description.slice(0, 200),
            plannedStartAt: item.plannedStart,
            plannedEndAt: end,
            startDate: item.plannedStart,
            dueDate: end,
            createdById: userId,
            sourceEstimateItemId: item.id,
            isArchived: false,
          },
        });
        tasksCreated += 1;
        continue;
      }

      const data: Prisma.TaskUpdateInput = {
        title: item.description.slice(0, 200),
        stage: { connect: { id: stageId } },
        isArchived: false,
      };
      // Дати: перезаписуємо лише якщо baseline не заморожений.
      if (!existing.baselineFrozenAt) {
        data.plannedStartAt = item.plannedStart;
        data.plannedEndAt = end;
        data.startDate = item.plannedStart;
        data.dueDate = end;
      } else {
        warnings.push(
          `Task ${existing.id} dates preserved: baseline frozen at ${existing.baselineFrozenAt.toISOString()}.`,
        );
      }

      await tx.task.update({ where: { id: existing.id }, data });
      tasksUpdated += 1;
    }

    // Archive orphans: tasks привʼязані до items яких більше нема серед
    // task-items (item видалили з кошторису або змінили itemType на material).
    for (const t of existingTasks) {
      if (t.sourceEstimateItemId && taskItemIds.has(t.sourceEstimateItemId)) continue;
      if (t.isArchived) continue;
      await tx.task.update({
        where: { id: t.id },
        data: { isArchived: true },
      });
      tasksArchived += 1;
    }

    // Перечитуємо актуальні task IDs.
    const refreshedTasks = await tx.task.findMany({
      where: {
        projectId,
        sourceEstimateItemId: { in: Array.from(taskItemIds) },
        isArchived: false,
      },
      select: { id: true, sourceEstimateItemId: true },
    });
    const taskIdByItemId = new Map<string, string>();
    for (const t of refreshedTasks) {
      if (t.sourceEstimateItemId) taskIdByItemId.set(t.sourceEstimateItemId, t.id);
    }

    // Sync TaskDependency.
    type ExpectedDep = {
      predecessorId: string;
      successorId: string;
      type: TaskDependencyType;
      lagDays: number;
    };
    const expected: ExpectedDep[] = [];
    for (const item of taskItems) {
      if (!item.predecessorItemId) continue;
      const successorId = taskIdByItemId.get(item.id);
      const predecessorId = taskIdByItemId.get(item.predecessorItemId);
      if (!successorId) continue;
      if (!predecessorId) {
        warnings.push(
          `Item ${item.id} predecessor ${item.predecessorItemId} is not a task — dependency skipped.`,
        );
        continue;
      }
      expected.push({
        predecessorId,
        successorId,
        type: item.dependencyType ?? "FS",
        lagDays: item.dependencyLagDays,
      });
    }

    const taskIds = Array.from(taskIdByItemId.values());
    const existingDeps = taskIds.length
      ? await tx.taskDependency.findMany({
          where: {
            predecessorId: { in: taskIds },
            successorId: { in: taskIds },
          },
          select: {
            id: true,
            predecessorId: true,
            successorId: true,
            type: true,
            lagDays: true,
          },
        })
      : [];
    const existingByKey = new Map<string, (typeof existingDeps)[number]>();
    for (const d of existingDeps) {
      existingByKey.set(`${d.predecessorId}→${d.successorId}`, d);
    }
    const expectedKeys = new Set(
      expected.map((e) => `${e.predecessorId}→${e.successorId}`),
    );

    for (const e of expected) {
      const key = `${e.predecessorId}→${e.successorId}`;
      const cur = existingByKey.get(key);
      if (!cur) {
        await tx.taskDependency.create({
          data: {
            predecessorId: e.predecessorId,
            successorId: e.successorId,
            type: e.type,
            lagDays: e.lagDays,
          },
        });
        dependenciesCreated += 1;
        continue;
      }
      if (cur.type !== e.type || cur.lagDays !== e.lagDays) {
        await tx.taskDependency.update({
          where: { id: cur.id },
          data: { type: e.type, lagDays: e.lagDays },
        });
        dependenciesUpdated += 1;
      }
    }

    for (const d of existingDeps) {
      const key = `${d.predecessorId}→${d.successorId}`;
      if (expectedKeys.has(key)) continue;
      await tx.taskDependency.delete({ where: { id: d.id } });
      dependenciesRemoved += 1;
    }
  });

  await auditLog({
    userId,
    action: "UPDATE",
    entity: "Estimate",
    entityId: estimateId,
    projectId,
    newData: {
      operation: "syncEstimateItemsToTasks",
      tasksCreated,
      tasksUpdated,
      tasksArchived,
      dependenciesCreated,
      dependenciesUpdated,
      dependenciesRemoved,
      warnings: warnings.length,
    },
  });

  return {
    estimateId,
    projectId,
    enabled: true,
    tasksCreated,
    tasksUpdated,
    tasksArchived,
    dependenciesCreated,
    dependenciesUpdated,
    dependenciesRemoved,
    warnings,
    syncedAt,
  };
}
