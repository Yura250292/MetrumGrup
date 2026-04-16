import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { seedProjectTaskDefaults } from "@/lib/tasks/defaults";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

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

  const existing = await prisma.taskLabel.count({ where: { projectId } });
  if (existing === 0) {
    await seedProjectTaskDefaults(projectId);
  }

  const items = await prisma.taskLabel.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
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

  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canManageTaskConfig) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const created = await prisma.taskLabel.create({
    data: {
      projectId,
      name,
      color: String(body.color ?? "#64748b"),
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
