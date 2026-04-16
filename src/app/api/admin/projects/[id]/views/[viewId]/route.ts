import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

async function loadView(projectId: string, viewId: string) {
  return prisma.savedView.findFirst({ where: { id: viewId, projectId } });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> },
) {
  const { id: projectId, viewId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const view = await loadView(projectId, viewId);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!view.isShared && view.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ data: view });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> },
) {
  const { id: projectId, viewId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const view = await loadView(projectId, viewId);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ownerOk = view.userId === session.user.id;
  const sharedOk = view.isShared && ctx.canEditAnyTask;
  if (!ownerOk && !sharedOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const updated = await prisma.savedView.update({
    where: { id: view.id },
    data: {
      name: typeof body.name === "string" ? body.name : undefined,
      filtersJson: body.filtersJson ?? undefined,
      groupBy: typeof body.groupBy === "string" ? body.groupBy : undefined,
      sortBy: typeof body.sortBy === "string" ? body.sortBy : undefined,
      columnsJson: body.columnsJson ?? undefined,
    },
  });
  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> },
) {
  const { id: projectId, viewId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const view = await loadView(projectId, viewId);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  const ownerOk = view.userId === session.user.id;
  const sharedOk = view.isShared && Boolean(ctx?.canEditAnyTask);
  if (!ownerOk && !sharedOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.savedView.delete({ where: { id: view.id } });
  return NextResponse.json({ ok: true });
}
