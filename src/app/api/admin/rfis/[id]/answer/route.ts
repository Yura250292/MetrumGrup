import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { canAnswerRFI } from "@/lib/rfi/access";
import { notifyProjectMembers } from "@/lib/notifications/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const rfi = await prisma.rFI.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { id: true, number: true, subject: true, status: true, askedById: true, assignedToId: true, projectId: true },
  });
  if (!rfi) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (!canAnswerRFI(rfi, session.user.id, role)) return forbiddenResponse();

  let body: { answer?: string };
  try {
    body = (await req.json()) as { answer?: string };
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!body.answer?.trim()) return NextResponse.json({ error: "answer-required" }, { status: 400 });

  const now = new Date();
  await prisma.rFI.update({
    where: { id },
    data: {
      answer: body.answer.trim(),
      answeredById: session.user.id,
      answeredAt: now,
      status: "ANSWERED",
    },
  });

  await notifyProjectMembers({
    projectId: rfi.projectId,
    actorId: session.user.id,
    type: "RFI_ANSWERED",
    title: `${rfi.number}: отримано відповідь`,
    body: rfi.subject,
    relatedEntity: "RFI",
    relatedId: rfi.id,
  });

  return NextResponse.json({ ok: true });
}
