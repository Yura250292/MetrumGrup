import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  validateTransition,
  transitionErrorStatus,
} from "@/lib/change-orders/state-machine";
import { applyApprovedCascade } from "@/lib/change-orders/cascade";
import { notifyCOApproved } from "@/lib/notifications/change-order-events";
import { generateChangeOrderPdf } from "@/lib/change-orders/pdf-generator";
import { uploadBufferToR2 } from "@/lib/r2-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const co = await prisma.changeOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      number: true,
      title: true,
      projectId: true,
      requestedById: true,
    },
  });
  if (!co) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const project = await prisma.project.findUnique({
    where: { id: co.projectId },
    select: { clientId: true },
  });
  if (!project || project.clientId !== session.user.id) return forbiddenResponse();

  const validation = validateTransition(co.status, "approve_client", "CLIENT");
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.reason },
      { status: transitionErrorStatus(validation.reason) },
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.changeOrder.update({
      where: { id },
      data: {
        status: "APPROVED",
        clientApprovedById: session.user.id,
        clientApprovedAt: now,
      },
    });
    await tx.changeOrderTransition.create({
      data: {
        changeOrderId: id,
        fromStatus: co.status,
        toStatus: "APPROVED",
        actorId: session.user.id,
        comment: "Затверджено клієнтом",
      },
    });
    await applyApprovedCascade(tx, id);
  });

  try {
    await notifyCOApproved({ ...co, status: "APPROVED" }, session.user.id);
  } catch (err) {
    console.error("[client/approve] notification failed:", err);
  }

  try {
    const full = await prisma.changeOrder.findUnique({
      where: { id },
      include: {
        firm: { select: { name: true, legalName: true } },
        project: { select: { title: true, address: true } },
        requestedBy: { select: { name: true } },
        items: {
          include: { costCode: { select: { code: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (full) {
      const buf = await generateChangeOrderPdf(full);
      const key = `change-orders/${id}/CO-${co.number}.pdf`;
      const pdfUrl = await uploadBufferToR2(key, buf, "application/pdf");
      await prisma.changeOrder.update({ where: { id }, data: { pdfUrl } });
    }
  } catch (err) {
    console.error("[client/approve] PDF gen failed:", err);
  }

  return NextResponse.json({ ok: true });
}
