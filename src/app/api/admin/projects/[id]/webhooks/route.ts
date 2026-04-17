import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
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
  if (!ctx || (!ctx.isSuperAdmin && !ctx.member?.effective.canManageWebhooks)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only super admins see global (projectId: null) webhooks
  const scopeFilter = ctx.isSuperAdmin
    ? { OR: [{ projectId }, { projectId: null }] }
    : { projectId };
  const items = await prisma.webhook.findMany({
    where: scopeFilter,
    orderBy: { createdAt: "desc" },
  });
  // Mask secret in listing
  return NextResponse.json({
    data: items.map((w) => ({ ...w, secret: "••••••" + w.secret.slice(-4) })),
  });
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
  if (!ctx || (!ctx.isSuperAdmin && !ctx.member?.effective.canManageWebhooks)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const url = String(body.url ?? "");
  const events = Array.isArray(body.events) ? body.events.map(String) : [];

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "valid url required" }, { status: 400 });
  }
  if (events.length === 0) {
    return NextResponse.json({ error: "events required" }, { status: 400 });
  }

  const secret = crypto.randomBytes(24).toString("hex");
  const created = await prisma.webhook.create({
    data: {
      projectId,
      url,
      events,
      secret,
      createdById: session.user.id,
      isActive: true,
    },
  });
  // Return full secret ONCE on creation
  return NextResponse.json({ data: created }, { status: 201 });
}
