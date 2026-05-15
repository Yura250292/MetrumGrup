import type { Prisma, TaskPriority } from "@prisma/client";

/**
 * Safe filter DSL → Prisma `where`.
 *
 * Only allow-listed fields are honoured. Anything unknown is silently
 * ignored. This keeps server-side Prisma queries sane and prevents an
 * attacker or buggy client from crafting unusual where-shapes.
 *
 * JSON spec example:
 * {
 *   "statusId": ["s_1", "s_2"],
 *   "priority": ["HIGH", "URGENT"],
 *   "assigneeId": "u_123",
 *   "labelId": ["l_1"],
 *   "dueBefore": "2026-05-30",
 *   "dueAfter":  "2026-04-01",
 *   "search": "roof",
 *   "isArchived": false,
 *   "createdById": "u_999"
 * }
 */

export type FilterSpec = {
  statusId?: string | string[];
  priority?: TaskPriority | TaskPriority[];
  assigneeId?: string | string[];
  labelId?: string | string[];
  stageId?: string | string[];
  parentTaskId?: string | null;
  dueBefore?: string | Date;
  dueAfter?: string | Date;
  search?: string;
  isArchived?: boolean;
  createdById?: string;
  hasDueDate?: boolean;
  overdue?: boolean;
};

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function parseDate(v: string | Date | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function buildTaskWhere(
  projectId: string,
  spec: FilterSpec,
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { projectId };
  const and: Prisma.TaskWhereInput[] = [];

  const statusIds = toArray(spec.statusId);
  if (statusIds.length > 0) where.statusId = { in: statusIds };

  const priorities = toArray(spec.priority);
  if (priorities.length > 0) where.priority = { in: priorities };

  const stageIds = toArray(spec.stageId);
  if (stageIds.length > 0) where.stageId = { in: stageIds };

  const assigneeIds = toArray(spec.assigneeId);
  if (assigneeIds.length > 0) {
    where.assignees = { some: { userId: { in: assigneeIds } } };
  }

  const labelIds = toArray(spec.labelId);
  if (labelIds.length > 0) {
    where.labels = { some: { labelId: { in: labelIds } } };
  }

  if (spec.parentTaskId === null) where.parentTaskId = null;
  else if (typeof spec.parentTaskId === "string") where.parentTaskId = spec.parentTaskId;

  if (typeof spec.createdById === "string") where.createdById = spec.createdById;

  if (typeof spec.isArchived === "boolean") where.isArchived = spec.isArchived;
  else where.isArchived = false;

  const dueBefore = parseDate(spec.dueBefore);
  const dueAfter = parseDate(spec.dueAfter);
  if (dueBefore || dueAfter) {
    where.dueDate = {
      ...(dueAfter ? { gte: dueAfter } : {}),
      ...(dueBefore ? { lte: dueBefore } : {}),
    };
  }

  if (spec.hasDueDate === true) {
    const curr = where.dueDate;
    const currObj =
      curr && typeof curr === "object" && !(curr instanceof Date) ? curr : {};
    where.dueDate = { ...currObj, not: null };
  }
  if (spec.hasDueDate === false) where.dueDate = null;

  if (spec.overdue === true) {
    and.push({ dueDate: { lt: new Date() } });
    and.push({ completedAt: null });
  }

  if (spec.search && spec.search.trim()) {
    const s = spec.search.trim();
    and.push({
      OR: [
        { title: { contains: s, mode: "insensitive" } },
        { description: { contains: s, mode: "insensitive" } },
      ],
    });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

export type SortSpec = "newest" | "oldest" | "dueAsc" | "dueDesc" | "priority" | "position";

export function buildTaskOrderBy(sort: SortSpec | undefined): Prisma.TaskOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }];
    case "oldest":
      return [{ createdAt: "asc" }];
    case "dueAsc":
      return [{ dueDate: { sort: "asc", nulls: "last" } }];
    case "dueDesc":
      return [{ dueDate: { sort: "desc", nulls: "last" } }];
    case "priority":
      return [{ priority: "desc" }, { createdAt: "desc" }];
    case "position":
    default:
      return [{ position: "asc" }, { createdAt: "desc" }];
  }
}
