import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  validateTransition,
  transitionErrorStatus,
} from "@/lib/change-orders/state-machine";
import { notifyCORejected } from "@/lib/notifications/change-order-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const body = (await req.json()) as { reason?: string };
  const reason = body.reason?.trim() || null;

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

  const validation = validateTransition(co.status, "reject", "CLIENT");
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
        status: "REJECTED",
        rejectedById: session.user.id,
        rejectedAt: now,
        rejectionReason: reason,
      },
    });
    await tx.changeOrderTransition.create({
      data: {
        changeOrderId: id,
        fromStatus: co.status,
        toStatus: "REJECTED",
        actorId: session.user.id,
        comment: reason,
      },
    });
  });

  try {
    await notifyCORejected({ ...co, status: "REJECTED" }, session.user.id, reason);
  } catch (err) {
    console.error("[client/reject] notification failed:", err);
  }
  return NextResponse.json({ ok: true });
}
