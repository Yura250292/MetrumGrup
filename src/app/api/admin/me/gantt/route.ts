import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

/**
 * GET /api/admin/me/gantt[?from=ISO&to=ISO]
 *
 * Особистий Gantt: задачі, де поточний користувач = assignee. Firm-scoped.
 * Повертає shape сумісний з frappe-gantt (items[]) + criticalIds:[].
 *
 * Критичний шлях ми поки що не рахуємо cross-project — це резерв для
 * майбутнього (programme-level CPM). Тут criticalIds = [].
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ data: { items: [], criticalIds: [] } });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const { firmId } = await resolveFirmScopeForRequest(session);

  const dateRange: Record<string, Date> = {};
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) dateRange.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) dateRange.lte = d;
  }

  const tasks = await prisma.task.findMany({
    where: {
      isArchived: false,
      assignees: { some: { userId: session.user.id } },
      ...(firmId ? { project: { firmId } } : {}),
      ...(Object.keys(dateRange).length > 0
        ? {
            OR: [
              { plannedStartAt: dateRange },
              { startDate: dateRange },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      dueDate: true,
      plannedStartAt: true,
      plannedEndAt: true,
      baselineFrozenAt: true,
      progressPercent: true,
      estimatedHours: true,
      actualHours: true,
      project: { select: { id: true, title: true } },
      status: { select: { isDone: true, color: true, name: true } },
      priority: true,
      _count: { select: { checklist: true } },
    },
    orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { dueDate: "asc" }],
  });

  const tasksWithoutDates = tasks
    .filter((t) => !t.startDate && !t.dueDate)
    .map((t) => ({
      id: t.id,
      title: `${t.project.title}: ${t.title}`,
      status: { name: t.status.name, color: t.status.color },
    }));
  const datedTasks = tasks.filter((t) => t.startDate || t.dueDate);

  const today = new Date();
  const items = datedTasks
    .map((t) => {
      const start = t.startDate ?? t.dueDate ?? today;
      const end = t.dueDate ?? t.startDate ?? today;
      let progress = t.progressPercent;
      if (progress === 0) {
        if (t.status.isDone) progress = 100;
        else if (t.estimatedHours && Number(t.estimatedHours) > 0) {
          progress = Math.min(
            100,
            Math.round((Number(t.actualHours) / Number(t.estimatedHours)) * 100),
          );
        }
      }
      const baseline =
        t.plannedStartAt && t.plannedEndAt
          ? {
              start: t.plannedStartAt.toISOString().slice(0, 10),
              end: t.plannedEndAt.toISOString().slice(0, 10),
            }
          : null;
      return {
        id: t.id,
        name: `${t.project.title}: ${t.title}`,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        progress,
        custom_class: "",
        dependencies: "",
        _meta: {
          status: t.status.name,
          statusColor: t.status.color,
          priority: t.priority,
          isDone: t.status.isDone,
          checklistCount: t._count.checklist,
          baseline,
          baselineFrozenAt: t.baselineFrozenAt?.toISOString() ?? null,
          projectId: t.project.id,
        },
      };
    })
    .filter((t) => t.start && t.end);

  return NextResponse.json({ data: { items, criticalIds: [], tasksWithoutDates } });
}
