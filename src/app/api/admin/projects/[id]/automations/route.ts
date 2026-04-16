import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import type { AutomationTrigger } from "@prisma/client";

const ALLOWED_TRIGGERS: AutomationTrigger[] = [
  "TASK_CREATED",
  "TASK_STATUS_CHANGED",
  "TASK_DUE_APPROACHING",
  "TIME_LOGGED",
  "RECURRING_CRON",
  "WEBHOOK",
  "EMAIL_RECEIVED",
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
  if (!ctx?.member?.effective.canManageAutomations && !ctx?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await prisma.automation.findMany({
    where: { OR: [{ projectId }, { projectId: null }] },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { runs: true } },
    },
    orderBy: { createdAt: "desc" },
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
  if (!ctx?.member?.effective.canManageAutomations && !ctx?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trigger = body.trigger as AutomationTrigger;
  if (!ALLOWED_TRIGGERS.includes(trigger)) {
    return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!Array.isArray(body.actionsJson) || body.actionsJson.length === 0) {
    return NextResponse.json({ error: "actionsJson must be non-empty array" }, { status: 400 });
  }

  const created = await prisma.automation.create({
    data: {
      projectId,
      name,
      trigger,
      triggerConfig: (body.triggerConfig as object | undefined) ?? undefined,
      conditionsJson: (body.conditionsJson as object | undefined) ?? undefined,
      actionsJson: body.actionsJson as object,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      createdById: session.user.id,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
