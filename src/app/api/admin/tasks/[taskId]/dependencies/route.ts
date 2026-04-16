import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { addDependency, DependencyError } from "@/lib/tasks/dependencies";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isTasksEnabledForProject(task.projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(task.projectId, session.user.id);
  if (!ctx?.canViewTasks) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [incoming, outgoing] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { successorId: taskId },
      include: {
        predecessor: { select: { id: true, title: true, status: true } },
      },
    }),
    prisma.taskDependency.findMany({
      where: { predecessorId: taskId },
      include: {
        successor: { select: { id: true, title: true, status: true } },
      },
    }),
  ]);
  return NextResponse.json({ data: { incoming, outgoing } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ctx = await getProjectAccessContext(task.projectId, session.user.id);
  if (!ctx?.canEditAnyTask) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Role is direction: either this task is predecessor or successor.
  const otherTaskId = String(body.otherTaskId ?? "");
  const role = body.role === "predecessor" ? "predecessor" : "successor";
  if (!otherTaskId) return NextResponse.json({ error: "otherTaskId required" }, { status: 400 });

  const predecessorId = role === "predecessor" ? taskId : otherTaskId;
  const successorId = role === "predecessor" ? otherTaskId : taskId;

  try {
    const dep = await addDependency({
      predecessorId,
      successorId,
      type: (body.type as "FS" | "SS" | "FF" | "SF" | undefined) ?? "FS",
      lagDays: typeof body.lagDays === "number" ? body.lagDays : 0,
    });
    return NextResponse.json({ data: dep }, { status: 201 });
  } catch (e) {
    if (e instanceof DependencyError) {
      return NextResponse.json(
        { error: e.message, details: e.details },
        { status: e.status },
      );
    }
    console.error("[task/dep/add]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
