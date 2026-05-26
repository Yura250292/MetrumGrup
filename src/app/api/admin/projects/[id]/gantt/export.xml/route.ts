import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import {
  serializeMsProjectXml,
  type MspTaskInput,
  type MspDependencyInput,
} from "@/lib/scheduling/ms-project-xml";

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

  const [project, tasks, deps] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { title: true },
    }),
    prisma.task.findMany({
      where: { projectId, isArchived: false },
      select: {
        id: true,
        title: true,
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
      select: { predecessorId: true, successorId: true, type: true, lagDays: true },
    }),
  ]);

  const today = new Date();
  const mspTasks: MspTaskInput[] = tasks.map((t) => {
    const start = t.plannedStartAt ?? t.startDate ?? today;
    const finish = t.plannedEndAt ?? t.dueDate ?? start;
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
      title: t.title,
      start,
      finish,
      percentComplete: progress,
    };
  });

  const mspDeps: MspDependencyInput[] = deps.map((d) => ({
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type as MspDependencyInput["type"],
    lagDays: d.lagDays,
  }));

  const xml = serializeMsProjectXml(mspTasks, mspDeps, {
    projectTitle: project?.title ?? "Metrum project",
  });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="gantt-${projectId}.xml"`,
    },
  });
}
