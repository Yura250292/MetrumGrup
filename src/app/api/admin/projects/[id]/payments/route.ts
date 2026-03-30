import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const { amount, method, scheduledDate, notes } = body;

  const payment = await prisma.payment.create({
    data: {
      projectId,
      amount,
      method: method || "BANK_TRANSFER",
      scheduledDate: new Date(scheduledDate),
      notes: notes || null,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "CREATE",
    entity: "Payment",
    entityId: payment.id,
    projectId,
    newData: { amount, scheduledDate },
  });

  return NextResponse.json({ data: payment }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const { paymentId, status, paidDate } = body;

  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status,
      paidDate: paidDate ? new Date(paidDate) : status === "PAID" ? new Date() : null,
    },
  });

  // Recalculate totalPaid
  if (status === "PAID") {
    const paidPayments = await prisma.payment.aggregate({
      where: { projectId, status: "PAID" },
      _sum: { amount: true },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { totalPaid: paidPayments._sum.amount || 0 },
    });
  }

  await auditLog({
    userId: session.user.id,
    action: "STATUS_CHANGE",
    entity: "Payment",
    entityId: paymentId,
    projectId,
    newData: { status },
  });

  return NextResponse.json({ data: payment });
}
