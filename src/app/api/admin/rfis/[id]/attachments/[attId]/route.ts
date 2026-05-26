import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { deleteFileFromR2 } from "@/lib/r2-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; attId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id, attId } = await ctx.params;
  const att = await prisma.rFIAttachment.findFirst({
    where: { id: attId, rfiId: id, rfi: { firmId: firmId ?? undefined } },
    select: { id: true, uploadedById: true, r2Key: true },
  });
  if (!att) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const isOwner = att.uploadedById === session.user.id;
  const isPm = ADMIN_ROLES.includes(role);
  if (!isOwner && !isPm) return forbiddenResponse();

  await prisma.rFIAttachment.delete({ where: { id: attId } });
  // Best-effort R2 cleanup.
  deleteFileFromR2(att.r2Key).catch(() => {});

  return NextResponse.json({ ok: true });
}
