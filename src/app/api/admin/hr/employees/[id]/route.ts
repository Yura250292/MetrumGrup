import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  type EmployeeRecord,
  redactSalaryForHr,
} from "@/lib/hr/employee-privacy";

export const runtime = "nodejs";

async function guard() {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() };
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return { error: forbiddenResponse() };
  }
  return { session };
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await ctx.params;
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: "Співробітника не знайдено" }, { status: 404 });
  }

  const engagement = await loadEngagement(id, employee.userId);

  return NextResponse.json({
    data: redactSalaryForHr(employee as EmployeeRecord, g.session.user.role),
    engagement,
  });
}

async function loadEngagement(employeeId: string, userId: string | null) {
  // Останні 30 днів — для агрегації годин і "поточної активності".
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  // Timesheets — завжди доступні через employeeId, навіть без User.
  const timesheets = await prisma.timesheet.findMany({
    where: { employeeId, date: { gte: monthAgo } },
    select: {
      projectId: true,
      hours: true,
      project: { select: { id: true, title: true, slug: true, status: true } },
    },
  });
  const timesheetByProject = new Map<
    string,
    {
      projectId: string;
      title: string;
      slug: string;
      status: string;
      hours: number;
    }
  >();
  for (const t of timesheets) {
    const k = t.projectId;
    const prev = timesheetByProject.get(k);
    const h = Number(t.hours);
    if (prev) {
      prev.hours += h;
    } else if (t.project) {
      timesheetByProject.set(k, {
        projectId: k,
        title: t.project.title,
        slug: t.project.slug,
        status: t.project.status,
        hours: h,
      });
    }
  }

  // User-залежні агрегації — лише якщо Employee привʼязаний до User.
  if (!userId) {
    return {
      projects: [],
      tasks: [],
      stages: [],
      hoursByProject: Array.from(timesheetByProject.values()),
    };
  }

  const [memberships, tasks, stages] = await Promise.all([
    prisma.projectMember.findMany({
      where: {
        userId,
        isActive: true,
        leftAt: null,
        project: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      },
      select: {
        roleInProject: true,
        joinedAt: true,
        project: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            startDate: true,
            expectedEndDate: true,
            currentStage: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    }),
    prisma.task.findMany({
      where: {
        isArchived: false,
        completedAt: null,
        assignees: { some: { userId } },
      },
      select: {
        id: true,
        title: true,
        priority: true,
        startDate: true,
        dueDate: true,
        project: { select: { id: true, title: true, slug: true } },
        status: { select: { name: true, color: true, isDone: true } },
        stage: { select: { stage: true, customName: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
    prisma.projectStageRecord.findMany({
      where: {
        responsibleUserId: userId,
        status: { not: "COMPLETED" },
        project: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      },
      select: {
        id: true,
        stage: true,
        customName: true,
        status: true,
        progress: true,
        startDate: true,
        endDate: true,
        project: { select: { id: true, title: true, slug: true } },
      },
      orderBy: [{ endDate: "asc" }],
      take: 30,
    }),
  ]);

  return {
    projects: memberships,
    tasks,
    stages,
    hoursByProject: Array.from(timesheetByProject.values()),
  };
}
