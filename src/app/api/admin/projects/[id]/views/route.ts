import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import type { TaskViewType } from "@prisma/client";

const ALLOWED_VIEW_TYPES: TaskViewType[] = ["LIST", "KANBAN", "GANTT", "CALENDAR", "PEOPLE"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const views = await prisma.savedView.findMany({
    where: {
      projectId,
      OR: [{ isShared: true }, { userId: session.user.id }],
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: views });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const viewType = body.viewType as TaskViewType;
  if (!ALLOWED_VIEW_TYPES.includes(viewType)) {
    return NextResponse.json({ error: "Invalid viewType" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const isShared = Boolean(body.isShared);
  // Only managers/admins can create shared views
  if (isShared && !ctx.canEditAnyTask) {
    return NextResponse.json({ error: "Not allowed to share view" }, { status: 403 });
  }

  const created = await prisma.savedView.create({
    data: {
      projectId,
      userId: isShared ? null : session.user.id,
      name,
      viewType,
      filtersJson: body.filtersJson as object | undefined,
      groupBy: body.groupBy ? String(body.groupBy) : null,
      sortBy: body.sortBy ? String(body.sortBy) : null,
      columnsJson: body.columnsJson as object | undefined,
      isShared,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
