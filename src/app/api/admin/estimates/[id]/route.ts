import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { notifyProjectMembers } from "@/lib/notifications/create";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Allow SUPER_ADMIN, MANAGER, ENGINEER, and FINANCIER to view estimates
  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      status: true,
      totalMaterials: true,
      totalLabor: true,
      totalOverhead: true,
      totalAmount: true,
      discount: true,
      finalAmount: true,
      notes: true,
      profitMarginMaterials: true,
      profitMarginLabor: true,
      profitMarginOverall: true,
      profitAmount: true,
      taxationType: true,
      taxRate: true,
      taxAmount: true,
      finalClientPrice: true,
      logisticsCost: true,
      createdAt: true,
      sentAt: true,
      approvedAt: true,
      pdvAmount: true,
      esvAmount: true,
      militaryTaxAmount: true,
      profitTaxAmount: true,
      unifiedTaxAmount: true,
      pdfoAmount: true,
      analysisSummary: true,
      prozorroAnalysis: true,
      structuredReport: true,
      bidIntelligence: true,
      project: { select: { title: true, client: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: { material: { select: { name: true, sku: true } } },
          },
        },
      },
    },
  });

  if (!estimate) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  return NextResponse.json({ data: estimate });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const { status, discount, notes } = body;

  // Зчитати поточний стан, щоб знати "до" значення для логу історії.
  const before = await prisma.estimate.findUnique({
    where: { id },
    select: {
      status: true,
      discount: true,
      notes: true,
      totalAmount: true,
      projectId: true,
      title: true,
      number: true,
      project: { select: { title: true } },
    },
  });
  if (!before) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) {
    updateData.status = status;
    if (status === "SENT") updateData.sentAt = new Date();
    if (status === "APPROVED") updateData.approvedAt = new Date();
  }
  if (discount !== undefined) {
    updateData.discount = discount;
    updateData.finalAmount = Number(before.totalAmount) * (1 - discount / 100);
  }
  if (notes !== undefined) updateData.notes = notes;

  const estimate = await prisma.estimate.update({
    where: { id },
    data: updateData,
  });

  // Залогувати зміни в історію кошторису. Помилка логування не повинна
  // валити сам PATCH — обгорнуто в try/catch.
  try {
    const logs: Array<{
      changeType: string;
      fieldName: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];

    if (status !== undefined && status !== before.status) {
      logs.push({
        changeType: "STATUS_CHANGE",
        fieldName: "status",
        oldValue: before.status,
        newValue: status,
      });
    }
    if (discount !== undefined && Number(discount) !== Number(before.discount ?? 0)) {
      logs.push({
        changeType: "DISCOUNT_CHANGE",
        fieldName: "discount",
        oldValue: Number(before.discount ?? 0),
        newValue: Number(discount),
      });
    }
    if (notes !== undefined && notes !== before.notes) {
      logs.push({
        changeType: "NOTES_CHANGE",
        fieldName: "notes",
        oldValue: before.notes,
        newValue: notes,
      });
    }

    for (const log of logs) {
      await prisma.estimateCriticalChange.create({
        data: {
          estimateId: id,
          userId: session.user.id,
          changeType: log.changeType,
          fieldName: log.fieldName,
          oldValue: log.oldValue as never,
          newValue: log.newValue as never,
        },
      });
    }
  } catch (err) {
    console.error("[estimates/PATCH] failed to log critical change", err);
  }

  // Notify project members on status change (especially APPROVED).
  if (status !== undefined && status !== before.status) {
    try {
      const isApproval = status === "APPROVED";
      await notifyProjectMembers({
        projectId: before.projectId,
        actorId: session.user.id,
        type: isApproval ? "PROJECT_ESTIMATE_APPROVED" : "PROJECT_UPDATED",
        title: isApproval
          ? `Кошторис ${before.number} затверджено`
          : `Статус кошторису ${before.number} → ${status}`,
        body: before.title,
        relatedEntity: "Estimate",
        relatedId: id,
      });
    } catch (err) {
      console.error("[estimates/PATCH] notifyProjectMembers failed:", err);
    }
  }

  return NextResponse.json({ data: estimate });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Only SUPER_ADMIN and MANAGER can delete estimates
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  try {
    // Delete estimate and all related data (cascade delete in Prisma schema)
    await prisma.estimate.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Кошторис успішно видалено"
    });
  } catch (error) {
    console.error("Error deleting estimate:", error);
    return NextResponse.json(
      { error: "Помилка при видаленні кошторису" },
      { status: 500 }
    );
  }
}
