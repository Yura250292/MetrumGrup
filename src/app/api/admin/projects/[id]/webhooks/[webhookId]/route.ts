import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";

async function canManage(projectId: string, userId: string) {
  const ctx = await getProjectAccessContext(projectId, userId);
  return !!ctx && (ctx.isSuperAdmin || ctx.member?.effective.canManageWebhooks);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const { id: projectId, webhookId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!(await canManage(projectId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const updated = await prisma.webhook.update({
    where: { id: webhookId },
    data: {
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
      events: Array.isArray(body.events) ? body.events.map(String) : undefined,
    },
  });
  return NextResponse.json({ data: { ...updated, secret: "••••••" } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const { id: projectId, webhookId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!(await canManage(projectId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.webhook.delete({ where: { id: webhookId } });
  return NextResponse.json({ ok: true });
}
