import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import {
  type COAction,
  validateTransition,
  transitionErrorStatus,
} from "@/lib/change-orders/state-machine";
import { applyApprovedCascade } from "@/lib/change-orders/cascade";
import {
  notifyCOSubmitted,
  notifyCOPMApproved,
  notifyCOAdminApproved,
  notifyCOApproved,
  notifyCORejected,
  notifyCOCancelled,
} from "@/lib/notifications/change-order-events";
import { generateChangeOrderPdf } from "@/lib/change-orders/pdf-generator";
import { uploadBufferToR2 } from "@/lib/r2-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const VALID_ACTIONS: ReadonlySet<COAction> = new Set([
  "submit",
  "approve_pm",
  "approve_admin",
  "approve_client",
  "reject",
  "cancel",
]);

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const body = (await req.json()) as { action?: COAction; comment?: string };
  if (!body.action || !VALID_ACTIONS.has(body.action))
    return NextResponse.json({ error: "action-invalid" }, { status: 400 });

  const co = await prisma.changeOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: {
      id: true,
      status: true,
      number: true,
      projectId: true,
      title: true,
      requestedById: true,
    },
  });
  if (!co) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const validation = validateTransition(co.status, body.action, role);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.reason },
      { status: transitionErrorStatus(validation.reason) },
    );
  }
  const nextStatus = validation.nextStatus;
  const now = new Date();
  const actorId = session.user.id;

  const cascadeRan = await prisma.$transaction(async (tx) => {
    const updateData: Record<string, unknown> = { status: nextStatus };
    if (body.action === "approve_pm") {
      updateData.pmApprovedById = actorId;
      updateData.pmApprovedAt = now;
    } else if (body.action === "approve_admin") {
      updateData.adminApprovedById = actorId;
      updateData.adminApprovedAt = now;
    } else if (body.action === "approve_client") {
      updateData.clientApprovedById = actorId;
      updateData.clientApprovedAt = now;
    } else if (body.action === "reject") {
      updateData.rejectedById = actorId;
      updateData.rejectedAt = now;
      updateData.rejectionReason = body.comment ?? null;
    } else if (body.action === "cancel") {
      updateData.cancelledById = actorId;
      updateData.cancelledAt = now;
    }

    await tx.changeOrder.update({ where: { id }, data: updateData });
    await tx.changeOrderTransition.create({
      data: {
        changeOrderId: id,
        fromStatus: co.status,
        toStatus: nextStatus,
        actorId,
        comment: body.comment ?? null,
      },
    });

    if (nextStatus === "APPROVED") {
      await applyApprovedCascade(tx, id);
      return true;
    }
    return false;
  });

  // Post-transition side-effects (outside DB tx).
  const lite = {
    id: co.id,
    number: co.number,
    title: co.title,
    projectId: co.projectId,
    requestedById: co.requestedById,
    status: nextStatus,
  };
  try {
    if (body.action === "submit") await notifyCOSubmitted(lite, actorId);
    else if (body.action === "approve_pm") await notifyCOPMApproved(lite, actorId);
    else if (body.action === "approve_admin") await notifyCOAdminApproved(lite, actorId);
    else if (body.action === "approve_client") await notifyCOApproved(lite, actorId);
    else if (body.action === "reject")
      await notifyCORejected(lite, actorId, body.comment ?? null);
    else if (body.action === "cancel") await notifyCOCancelled(lite, actorId);
  } catch (err) {
    console.error("[change-orders] notification failed:", err);
  }

  // On APPROVED — generate PDF and persist URL.
  if (cascadeRan) {
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
        await prisma.changeOrder.update({
          where: { id },
          data: { pdfUrl },
        });
      }
    } catch (err) {
      console.error("[change-orders] PDF generation failed:", err);
    }
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
