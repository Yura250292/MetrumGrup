import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  WRITE_ROLES,
  isAccessResponse,
  requireCounterpartyAccess,
} from "@/lib/counterparties/access";

export const runtime = "nodejs";

/**
 * DELETE — soft delete (isActive=false). Документ залишається у БД для
 * аудиту й R2-файл не видаляється. Hard delete — окремий SUPER_ADMIN-flow
 * (не в rev.1).
 */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
) {
  const session = await auth();
  const { id, docId } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: WRITE_ROLES,
  });
  if (isAccessResponse(access)) return access;

  const doc = await prisma.counterpartyDocument.findFirst({
    where: { id: docId, counterpartyId: id },
    select: { id: true, isActive: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Документ не знайдено" }, { status: 404 });
  }
  if (!doc.isActive) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  await prisma.counterpartyDocument.update({
    where: { id: docId },
    data: { isActive: false },
  });
  return NextResponse.json({ ok: true });
}
