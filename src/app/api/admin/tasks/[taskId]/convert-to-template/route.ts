import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { convertTaskToTemplate } from "@/lib/tasks/templates";

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
  if (!ctx?.canCreateTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const id = await convertTaskToTemplate(taskId, {
      name,
      projectScoped: body.projectScoped !== false,
      createdById: session.user.id,
    });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
