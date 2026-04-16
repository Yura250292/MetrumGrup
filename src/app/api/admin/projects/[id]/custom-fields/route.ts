import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import type { TaskCustomFieldType } from "@prisma/client";

const ALLOWED: TaskCustomFieldType[] = [
  "TEXT",
  "NUMBER",
  "DATE",
  "SELECT",
  "MULTI_SELECT",
  "URL",
  "USER",
];

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
  if (!ctx?.canViewTasks) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await prisma.taskCustomField.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
  return NextResponse.json({ data: items });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.member?.effective.canManageCustomFields && !ctx?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const type = body.type as TaskCustomFieldType;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!ALLOWED.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const last = await prisma.taskCustomField.aggregate({
    where: { projectId },
    _max: { position: true },
  });

  const created = await prisma.taskCustomField.create({
    data: {
      projectId,
      name,
      type,
      options:
        type === "SELECT" || type === "MULTI_SELECT"
          ? ((body.options as object | undefined) ?? {})
          : undefined,
      position: (last._max.position ?? -1) + 1,
      isRequired: Boolean(body.isRequired),
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
