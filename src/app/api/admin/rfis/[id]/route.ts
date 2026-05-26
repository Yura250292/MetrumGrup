import { NextRequest, NextResponse } from "next/server";
import type { RFIPriority } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { canEditRFI } from "@/lib/rfi/access";
import { notifyUsers } from "@/lib/notifications/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const VALID_PRIORITIES = new Set<RFIPriority>(["LOW", "NORMAL", "HIGH", "URGENT"]);

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const rfi = await prisma.rFI.findFirst({
    where: { id, firmId: firmId ?? undefined },
    include: {
      project: { select: { id: true, title: true } },
      askedBy: { select: { id: true, name: true, avatar: true } },
      assignedTo: { select: { id: true, name: true, avatar: true } },
      answeredBy: { select: { id: true, name: true, avatar: true } },
      closedBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { uploadedAt: "asc" },
      },
      comments: {
        include: { author: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!rfi) return NextResponse.json({ error: "not-found" }, { status: 404 });

  return NextResponse.json({ rfi });
}

type PatchBody = {
  subject?: string;
  question?: string;
  priority?: RFIPriority;
  assignedToId?: string | null;
  impactsSchedule?: boolean;
  impactsBudget?: boolean;
};

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const rfi = await prisma.rFI.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { id: true, status: true, askedById: true, assignedToId: true },
  });
  if (!rfi) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (!canEditRFI(rfi, session.user.id, role)) return forbiddenResponse();

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (body.priority && !VALID_PRIORITIES.has(body.priority))
    return NextResponse.json({ error: "priority-invalid" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.subject !== undefined) data.subject = body.subject.trim();
  if (body.question !== undefined) data.question = body.question.trim();
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.impactsSchedule !== undefined) data.impactsSchedule = body.impactsSchedule;
  if (body.impactsBudget !== undefined) data.impactsBudget = body.impactsBudget;

  const oldAssignee = rfi.assignedToId;
  const newAssignee = body.assignedToId === undefined ? undefined : body.assignedToId;
  if (newAssignee !== undefined) data.assignedToId = newAssignee;

  const updated = await prisma.rFI.update({
    where: { id },
    data,
    select: { id: true, number: true, subject: true, assignedToId: true },
  });

  // Notify on assignee change.
  if (newAssignee !== undefined && newAssignee && newAssignee !== oldAssignee) {
    await notifyUsers({
      userIds: [newAssignee],
      actorId: session.user.id,
      type: "RFI_ASSIGNED",
      title: `${updated.number}: вам призначено RFI`,
      body: updated.subject,
      relatedEntity: "RFI",
      relatedId: updated.id,
    });
  }

  return NextResponse.json({ id: updated.id });
}
