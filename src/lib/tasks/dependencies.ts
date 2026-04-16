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
 * Full CPM (Critical Path Method) for a project.
 *
 * Forward pass  → ES (Early Start) + EF (Early Finish) for each task
 * Backward pass → LS (Late Start)  + LF (Late Finish)  for each task
 * Float         → Total Float  = LS − ES  (slack without delaying project)
 *                 Free Float   = min(succ.ES) − this.EF − lag  (without delaying successors)
 *
 * Critical path = tasks with totalFloat = 0.
 *
 * Dependency type semantics (offsets in *days*, calendar-days — working-day
 * calendar can be layered later via `UserWorkSchedule`):
 *   FS (Finish-to-Start):  succ.ES ≥ pred.EF + lag
 *   SS (Start-to-Start):   succ.ES ≥ pred.ES + lag
 *   FF (Finish-to-Finish): succ.EF ≥ pred.EF + lag  ⇒ succ.ES ≥ pred.EF + lag − succ.duration
 *   SF (Start-to-Finish):  succ.EF ≥ pred.ES + lag  ⇒ succ.ES ≥ pred.ES + lag − succ.duration
 *
 * All times are expressed in whole calendar days since the earliest
 * project anchor (min startDate across tasks, or today if none).
 */
export type CpmNode = {
  id: string;
  title: string;
  duration: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
};

export async function computeCriticalPath(projectId: string): Promise<{
  criticalIds: string[];
  durations: Record<string, number>;
  cpm: Record<string, CpmNode>;
  projectDurationDays: number;
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

  if (tasks.length === 0) {
    return { criticalIds: [], durations: {}, cpm: {}, projectDurationDays: 0 };
  }

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

  const duration = (n: TaskNode): number => {
    if (n.estimatedHours) return Math.max(1, Math.ceil(n.estimatedHours / 8));
    if (n.startDate && n.dueDate) {
      const diff = n.dueDate.getTime() - n.startDate.getTime();
      return Math.max(1, Math.ceil(diff / (24 * 3600 * 1000)));
    }
    return 1;
  };

  const edges: DepEdge[] = deps.map((d) => ({
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type,
    lagDays: d.lagDays,
  }));

  // Build outgoing (pred → succ) and incoming (succ ← pred) adjacency
  const outgoing = new Map<string, DepEdge[]>();
  const incoming = new Map<string, DepEdge[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodes.keys()) {
    inDegree.set(id, 0);
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const e of edges) {
    outgoing.get(e.predecessorId)!.push(e);
    incoming.get(e.successorId)!.push(e);
    inDegree.set(e.successorId, (inDegree.get(e.successorId) ?? 0) + 1);
  }

  // Kahn topo sort for forward pass
  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
  const topo: string[] = [];
  const inDeg = new Map(inDegree);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    topo.push(cur);
    for (const e of outgoing.get(cur) ?? []) {
      const d = (inDeg.get(e.successorId) ?? 0) - 1;
      inDeg.set(e.successorId, d);
      if (d === 0) queue.push(e.successorId);
    }
  }

  // Cycle guard — should not happen given addDependency prevents cycles
  if (topo.length !== nodes.size) {
    return { criticalIds: [], durations: {}, cpm: {}, projectDurationDays: 0 };
  }

  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  // Forward pass — compute ES/EF per dependency type
  for (const id of topo) {
    const node = nodes.get(id)!;
    const dur = duration(node);
    let earliestStart = 0;
    for (const e of incoming.get(id) ?? []) {
      const predEs = es.get(e.predecessorId) ?? 0;
      const predEf = ef.get(e.predecessorId) ?? 0;
      const lag = e.lagDays ?? 0;
      let candidate = 0;
      switch (e.type) {
        case "FS":
          candidate = predEf + lag;
          break;
        case "SS":
          candidate = predEs + lag;
          break;
        case "FF":
          candidate = predEf + lag - dur;
          break;
        case "SF":
          candidate = predEs + lag - dur;
          break;
      }
      if (candidate > earliestStart) earliestStart = candidate;
    }
    es.set(id, earliestStart);
    ef.set(id, earliestStart + dur);
  }

  // Project duration = max EF
  let projectDurationDays = 0;
  for (const v of ef.values()) if (v > projectDurationDays) projectDurationDays = v;

  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  // Backward pass — reverse topo order
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i]!;
    const node = nodes.get(id)!;
    const dur = duration(node);
    const succs = outgoing.get(id) ?? [];

    let latestFinish: number;
    if (succs.length === 0) {
      // Terminal node — LF = project duration
      latestFinish = projectDurationDays;
    } else {
      latestFinish = Infinity;
      for (const e of succs) {
        const succLs = ls.get(e.successorId) ?? 0;
        const succLf = lf.get(e.successorId) ?? 0;
        const lag = e.lagDays ?? 0;
        let candidate = 0;
        switch (e.type) {
          case "FS":
            candidate = succLs - lag;
            break;
          case "SS":
            candidate = succLs - lag + dur;
            break;
          case "FF":
            candidate = succLf - lag;
            break;
          case "SF":
            candidate = succLf - lag + dur;
            break;
        }
        if (candidate < latestFinish) latestFinish = candidate;
      }
    }
    lf.set(id, latestFinish);
    ls.set(id, latestFinish - dur);
  }

  // Float + critical path
  const cpm: Record<string, CpmNode> = {};
  const criticalIds: string[] = [];
  const durations: Record<string, number> = {};

  for (const [id, node] of nodes) {
    const dur = duration(node);
    durations[id] = dur;
    const nodeEs = es.get(id) ?? 0;
    const nodeEf = ef.get(id) ?? 0;
    const nodeLs = ls.get(id) ?? 0;
    const nodeLf = lf.get(id) ?? 0;
    const totalFloat = nodeLs - nodeEs;

    // Free Float — min(succ.ES) − this.EF (only for FS; for other types
    // it's the earliest moment the successor could still start without delay).
    let freeFloat = totalFloat;
    for (const e of outgoing.get(id) ?? []) {
      const succEs = es.get(e.successorId) ?? 0;
      const lag = e.lagDays ?? 0;
      let slack = 0;
      switch (e.type) {
        case "FS":
          slack = succEs - (nodeEf + lag);
          break;
        case "SS":
          slack = succEs - (nodeEs + lag);
          break;
        case "FF":
        case "SF":
          // Use LF-based slack as safe lower bound
          slack = totalFloat;
          break;
      }
      if (slack < freeFloat) freeFloat = slack;
    }
    if (freeFloat < 0) freeFloat = 0;

    const isCritical = totalFloat === 0;
    if (isCritical) criticalIds.push(id);

    cpm[id] = {
      id,
      title: node.title,
      duration: dur,
      es: nodeEs,
      ef: nodeEf,
      ls: nodeLs,
      lf: nodeLf,
      totalFloat,
      freeFloat,
      isCritical,
    };
  }

  return { criticalIds, durations, cpm, projectDurationDays };
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
