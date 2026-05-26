import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import { serializeGanttCsv, type CsvTaskInput } from "@/lib/scheduling/csv-export";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [tasks, deps] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, isArchived: false },
      select: {
        id: true,
        title: true,
        parentTaskId: true,
        startDate: true,
        dueDate: true,
        plannedStartAt: true,
        plannedEndAt: true,
        progressPercent: true,
        estimatedHours: true,
        actualHours: true,
        status: { select: { isDone: true } },
      },
      orderBy: [{ position: "asc" }, { startDate: "asc" }],
    }),
    prisma.taskDependency.findMany({
      where: { predecessor: { projectId } },
      select: { predecessorId: true, successorId: true },
    }),
  ]);

  const predsBySucc = new Map<string, string[]>();
  for (const d of deps) {
    const arr = predsBySucc.get(d.successorId) ?? [];
    arr.push(d.predecessorId);
    predsBySucc.set(d.successorId, arr);
  }

  const csvInput: CsvTaskInput[] = tasks.map((t) => {
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
    return {
      id: t.id,
      parentId: t.parentTaskId,
      title: t.title,
      plannedStart: t.plannedStartAt,
      plannedEnd: t.plannedEndAt,
      actualStart: t.startDate,
      actualEnd: t.dueDate,
      progressPercent: progress,
      predecessorIds: predsBySucc.get(t.id) ?? [],
    };
  });

  const csv = serializeGanttCsv(csvInput);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gantt-${projectId}.csv"`,
    },
  });
}
