import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { canCloseRFI } from "@/lib/rfi/access";
import { notifyProjectMembers } from "@/lib/notifications/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
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
  if (!canCloseRFI(rfi, session.user.id, role)) return forbiddenResponse();

  await prisma.rFI.update({
    where: { id },
    data: { status: "CLOSED", closedById: session.user.id, closedAt: new Date() },
  });

  await notifyProjectMembers({
    projectId: rfi.projectId,
    actorId: session.user.id,
    type: "RFI_CLOSED",
    title: `${rfi.number}: закрито`,
    body: rfi.subject,
    relatedEntity: "RFI",
    relatedId: rfi.id,
  });

  return NextResponse.json({ ok: true });
}
