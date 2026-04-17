import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Cross-project tasks grouped by assignee.
 * Returns people the current user can see (projects where they are a member),
 * with each person's open tasks and summary counts.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ data: { people: [] } });
  }

  const uid = session.user.id;
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  const tasks = await prisma.task.findMany({
    where: {
      isArchived: false,
      status: { isDone: false },
      ...(isSuperAdmin
        ? {}
        : {
            project: {
              members: { some: { userId: uid, isActive: true } },
            },
          }),
    },
    include: {
      assignees: {
        include: { user: { select: { id: true, name: true, avatar: true } } },
      },
      project: { select: { id: true, title: true } },
      status: true,
    },
    orderBy: [
      { dueDate: { sort: "asc", nulls: "last" } },
      { priority: "desc" },
    ],
    take: 500,
  });

  const peopleMap = new Map<
    string,
    {
      user: { id: string; name: string; avatar: string | null };
      tasks: typeof tasks;
      overdue: number;
    }
  >();

  const now = new Date();

  for (const t of tasks) {
    const assignees = t.assignees.length > 0
      ? t.assignees
      : [{ user: { id: "__unassigned__", name: "Без виконавця", avatar: null } }];

    for (const a of assignees) {
      if (!peopleMap.has(a.user.id)) {
        peopleMap.set(a.user.id, { user: a.user, tasks: [], overdue: 0 });
      }
      const entry = peopleMap.get(a.user.id)!;
      entry.tasks.push(t);
      if (t.dueDate && new Date(t.dueDate) < now) entry.overdue++;
    }
  }

  const people = [...peopleMap.values()]
    .map((p) => ({
      user: p.user,
      counts: {
        total: p.tasks.length,
        overdue: p.overdue,
      },
      tasks: p.tasks.slice(0, 50).map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        project: t.project,
        status: t.status,
      })),
    }))
    .sort((a, b) => a.user.name.localeCompare(b.user.name, "uk"));

  return NextResponse.json({ data: { people } });
}
