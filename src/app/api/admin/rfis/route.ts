import { NextRequest, NextResponse } from "next/server";
import type { RFIPriority, RFIStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { canCreateRFI } from "@/lib/rfi/access";
import { nextRFINumber } from "@/lib/rfi/numbering";
import { computeDueAt } from "@/lib/rfi/sla";
import { notifyUsers } from "@/lib/notifications/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<RFIStatus>(["OPEN", "IN_PROGRESS", "ANSWERED", "CLOSED", "CANCELLED"]);
const VALID_PRIORITIES = new Set<RFIPriority>(["LOW", "NORMAL", "HIGH", "URGENT"]);

type CreateBody = {
  projectId: string;
  subject: string;
  question: string;
  priority?: RFIPriority;
  assignedToId?: string | null;
  impactsSchedule?: boolean;
  impactsBudget?: boolean;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const statusParam = url.searchParams.get("status");
  const priorityParam = url.searchParams.get("priority");
  const assigneeId = url.searchParams.get("assigneeId");
  const overdue = url.searchParams.get("overdue") === "1";
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);

  const status = statusParam && VALID_STATUSES.has(statusParam as RFIStatus) ? (statusParam as RFIStatus) : undefined;
  const priority =
    priorityParam && VALID_PRIORITIES.has(priorityParam as RFIPriority) ? (priorityParam as RFIPriority) : undefined;

  const rfis = await prisma.rFI.findMany({
    where: {
      firmId: firmId ?? undefined,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(assigneeId ? { assignedToId: assigneeId } : {}),
      ...(overdue
        ? { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lte: new Date(), not: null } }
        : {}),
    },
    include: {
      project: { select: { id: true, title: true } },
      askedBy: { select: { id: true, name: true, avatar: true } },
      assignedTo: { select: { id: true, name: true, avatar: true } },
      _count: { select: { attachments: true, comments: true } },
    },
    orderBy: [{ status: "asc" }, { askedAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({
    rfis: rfis.map((r) => ({
      id: r.id,
      number: r.number,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      askedAt: r.askedAt,
      dueAt: r.dueAt,
      answeredAt: r.answeredAt,
      closedAt: r.closedAt,
      impactsSchedule: r.impactsSchedule,
      impactsBudget: r.impactsBudget,
      project: r.project,
      askedBy: r.askedBy,
      assignedTo: r.assignedTo,
      attachmentCount: r._count.attachments,
      commentCount: r._count.comments,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !canCreateRFI(role) || !firmId) return forbiddenResponse();

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return badRequest("invalid-json");
  }
  if (!body.projectId) return badRequest("projectId-required");
  if (!body.subject?.trim()) return badRequest("subject-required");
  if (!body.question?.trim()) return badRequest("question-required");
  if (body.priority && !VALID_PRIORITIES.has(body.priority)) return badRequest("priority-invalid");

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, firmId },
    select: { id: true },
  });
  if (!project) return forbiddenResponse();

  const sla = await prisma.firmRFISLA.findUnique({ where: { firmId } });
  const priority = body.priority ?? "NORMAL";
  const askedAt = new Date();
  const dueAt = computeDueAt(askedAt, priority, sla);

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextRFINumber(tx, body.projectId);
    return tx.rFI.create({
      data: {
        firmId,
        projectId: body.projectId,
        number,
        subject: body.subject.trim(),
        question: body.question.trim(),
        priority,
        askedById: session.user.id,
        askedAt,
        assignedToId: body.assignedToId ?? null,
        dueAt,
        impactsSchedule: body.impactsSchedule ?? false,
        impactsBudget: body.impactsBudget ?? false,
      },
      select: { id: true, number: true, assignedToId: true, subject: true },
    });
  });

  if (created.assignedToId) {
    await notifyUsers({
      userIds: [created.assignedToId],
      actorId: session.user.id,
      type: "RFI_ASSIGNED",
      title: `${created.number}: вам призначено RFI`,
      body: created.subject,
      relatedEntity: "RFI",
      relatedId: created.id,
    });
  }

  return NextResponse.json({ id: created.id, number: created.number }, { status: 201 });
}
