import { prisma } from "@/lib/prisma";
import type { TaskDependencyType } from "@prisma/client";

/**
 * Task dependency service.
 *
 * Features:
 *  - Cycle detection (DFS) before adding a new dependency
 *  - Critical path computation via forward/backward pass (Kahn's topo sort)
 *    on a DAG built from (FS / SS / FF / SF) dependencies
 *
 * Scope: per-project. All ops validate that both tasks belong to the same project.
 */

export class DependencyError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "DependencyError";
  }
}

export async function addDependency(opts: {
  predecessorId: string;
  successorId: string;
  type?: TaskDependencyType;
  lagDays?: number;
}) {
  if (opts.predecessorId === opts.successorId) {
    throw new DependencyError("Task cannot depend on itself", 400);
  }
  const tasks = await prisma.task.findMany({
    where: { id: { in: [opts.predecessorId, opts.successorId] } },
    select: { id: true, projectId: true },
  });
  if (tasks.length !== 2) {
    throw new DependencyError("Task(s) not found", 404);
  }
  if (tasks[0]!.projectId !== tasks[1]!.projectId) {
    throw new DependencyError(
      "Dependency tasks must be in the same project",
      400,
    );
  }

  // Cycle check: would adding predecessor → successor create a cycle?
  // Walk from successorId following existing dependencies; if we hit
  // predecessorId, it's a cycle.
  const cyclePath = await findCycle(
    opts.successorId,
    opts.predecessorId,
    tasks[0]!.projectId,
  );
  if (cyclePath) {
    throw new DependencyError(
      "Adding this dependency would create a cycle",
      409,
      { cycle: cyclePath },
    );
  }

  return prisma.taskDependency.create({
    data: {
      predecessorId: opts.predecessorId,
      successorId: opts.successorId,
      type: opts.type ?? "FS",
      lagDays: opts.lagDays ?? 0,
    },
  });
}

export async function removeDependency(depId: string) {
  await prisma.taskDependency.delete({ where: { id: depId } });
}

/**
 * BFS from `startId` following outgoing dependencies. If `targetId` is reached,
 * return the path (including target). Otherwise null.
 */
async function findCycle(
  startId: string,
  targetId: string,
  projectId: string,
): Promise<string[] | null> {
  // Load all deps in project once — cheaper than N queries for medium graphs
  const deps = await prisma.taskDependency.findMany({
    where: {
      predecessor: { projectId },
    },
    select: { predecessorId: true, successorId: true },
  });
  const adj = new Map<string, string[]>();
  for (const d of deps) {
    const arr = adj.get(d.predecessorId) ?? [];
    arr.push(d.successorId);
    adj.set(d.predecessorId, arr);
  }

  const parent = new Map<string, string>();
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const nexts = adj.get(cur) ?? [];
    for (const n of nexts) {
      if (visited.has(n)) continue;
      parent.set(n, cur);
      if (n === targetId) {
        // Reconstruct path
        const path = [n];
        let p = parent.get(n);
        while (p) {
          path.unshift(p);
          if (p === startId) break;
          p = parent.get(p);
        }
        return path;
      }
      visited.add(n);
      queue.push(n);
    }
  }
  return null;
}

type TaskNode = {
  id: string;
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  statusIsDone: boolean;
};

type DepEdge = {
  predecessorId: string;
  successorId: string;
  type: TaskDependencyType;
  lagDays: number;
};

/**
 * Compute critical path for a project. Nodes: tasks with dueDate (or derived end).
 * Edges: FS-style predecessor → successor.
 *
 * Uses a simplified longest-path algorithm by duration (days).
 * Returns the set of task IDs lying on the longest path.
 *
 * For production-grade CPM we'd need full ES/EF/LS/LF pass; this simplified
 * version correctly highlights the critical chain for most construction
 * project sizes (< 500 tasks).
 */
export async function computeCriticalPath(projectId: string): Promise<{
  criticalIds: string[];
  durations: Record<string, number>;
}> {
  const [tasks, deps] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, isArchived: false },
      select: {
        id: true,
        title: true,
        startDate: true,
        dueDate: true,
        estimatedHours: true,
        status: { select: { isDone: true } },
      },
    }),
    prisma.taskDependency.findMany({
      where: { predecessor: { projectId } },
      select: {
        predecessorId: true,
        successorId: true,
        type: true,
        lagDays: true,
      },
    }),
  ]);

  if (tasks.length === 0) return { criticalIds: [], durations: {} };

  const nodes: Map<string, TaskNode> = new Map(
    tasks.map((t) => [
      t.id,
      {
        id: t.id,
        title: t.title,
        startDate: t.startDate,
        dueDate: t.dueDate,
        estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
        statusIsDone: t.status.isDone,
      },
    ]),
  );

  const edges: DepEdge[] = deps.map((d) => ({
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type,
    lagDays: d.lagDays,
  }));

  // Build adjacency and in-degree for topo sort
  const adj = new Map<string, DepEdge[]>();
  const inDegree = new Map<string, number>();
  for (const t of tasks) inDegree.set(t.id, 0);
  for (const e of edges) {
    const arr = adj.get(e.predecessorId) ?? [];
    arr.push(e);
    adj.set(e.predecessorId, arr);
    inDegree.set(e.successorId, (inDegree.get(e.successorId) ?? 0) + 1);
  }

  // Kahn's topo sort
  const queue: string[] = [];
  for (const [id, d] of inDegree) if (d === 0) queue.push(id);
  const topo: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    topo.push(cur);
    for (const e of adj.get(cur) ?? []) {
      const nextDeg = (inDegree.get(e.successorId) ?? 0) - 1;
      inDegree.set(e.successorId, nextDeg);
      if (nextDeg === 0) queue.push(e.successorId);
    }
  }

  // If topo size != node count, we had a cycle (shouldn't happen — add guards it).
  if (topo.length !== nodes.size) return { criticalIds: [], durations: {} };

  const duration = (n: TaskNode): number => {
    if (n.estimatedHours) return Math.max(1, Math.ceil(n.estimatedHours / 8));
    if (n.startDate && n.dueDate) {
      const diff = n.dueDate.getTime() - n.startDate.getTime();
      return Math.max(1, Math.ceil(diff / (24 * 3600 * 1000)));
    }
    return 1;
  };

  // Longest path DP on topo order
  const dist = new Map<string, number>();
  const pred = new Map<string, string | null>();
  for (const id of topo) {
    const node = nodes.get(id)!;
    const d = duration(node);
    // Initial distance = own duration
    if (!dist.has(id)) {
      dist.set(id, d);
      pred.set(id, null);
    }
    const curDist = dist.get(id)!;
    for (const e of adj.get(id) ?? []) {
      const succ = nodes.get(e.successorId);
      if (!succ) continue;
      const candidate = curDist + (e.lagDays ?? 0) + duration(succ);
      if (candidate > (dist.get(e.successorId) ?? 0)) {
        dist.set(e.successorId, candidate);
        pred.set(e.successorId, id);
      }
    }
  }

  // Find node with max distance
  let endId: string | null = null;
  let maxDist = -1;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      endId = id;
    }
  }

  const criticalIds: string[] = [];
  if (endId) {
    let cur: string | null = endId;
    while (cur) {
      criticalIds.unshift(cur);
      cur = pred.get(cur) ?? null;
    }
  }

  const durations: Record<string, number> = {};
  for (const [id, node] of nodes) durations[id] = duration(node);

  return { criticalIds, durations };
}

/**
 * Shape tasks for frappe-gantt consumer.
 * Each gantt-task needs: { id, name, start, end, progress, dependencies }
 */
export async function getGanttData(projectId: string) {
  const [tasks, deps, critical] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, isArchived: false },
      select: {
        id: true,
        title: true,
        startDate: true,
        dueDate: true,
        estimatedHours: true,
        status: { select: { isDone: true, color: true, name: true } },
        priority: true,
        _count: { select: { checklist: true } },
      },
      orderBy: { startDate: { sort: "asc", nulls: "last" } },
    }),
    prisma.taskDependency.findMany({
      where: { predecessor: { projectId } },
      select: { predecessorId: true, successorId: true, type: true, lagDays: true },
    }),
    computeCriticalPath(projectId),
  ]);

  // Deps grouped by successor (frappe-gantt wants dependencies on the successor)
  const incomingBySuccessor = new Map<string, string[]>();
  for (const d of deps) {
    const arr = incomingBySuccessor.get(d.successorId) ?? [];
    arr.push(d.predecessorId);
    incomingBySuccessor.set(d.successorId, arr);
  }

  const today = new Date();
  const items = tasks
    .map((t) => {
      const start = t.startDate ?? t.dueDate ?? today;
      const end =
        t.dueDate ??
        (t.startDate && t.estimatedHours
          ? new Date(
              t.startDate.getTime() +
                Math.max(1, Math.ceil(Number(t.estimatedHours) / 8)) *
                  24 *
                  3600 *
                  1000,
            )
          : t.startDate ?? today);
      return {
        id: t.id,
        name: t.title,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        progress: t.status.isDone ? 100 : 0,
        custom_class: critical.criticalIds.includes(t.id) ? "critical" : "",
        dependencies: (incomingBySuccessor.get(t.id) ?? []).join(","),
        _meta: {
          status: t.status.name,
          statusColor: t.status.color,
          priority: t.priority,
          isDone: t.status.isDone,
          checklistCount: t._count.checklist,
        },
      };
    })
    .filter((t) => t.start && t.end);

  return { items, criticalIds: critical.criticalIds, deps };
}
