import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { canCancelRFI } from "@/lib/rfi/access";

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
    select: { id: true, status: true, askedById: true, assignedToId: true },
  });
  if (!rfi) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (!canCancelRFI(rfi, session.user.id, role)) return forbiddenResponse();

  let body: { reason?: string };
  try {
    body = (await req.json()) as { reason?: string };
  } catch {
    body = {};
  }

  await prisma.rFI.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledById: session.user.id,
      cancelledAt: new Date(),
      cancelReason: body.reason?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true });
}
