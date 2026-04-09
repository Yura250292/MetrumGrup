import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

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
      // analysisSummary: true, // Temporarily excluded until migration is applied
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

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) {
    updateData.status = status;
    if (status === "SENT") updateData.sentAt = new Date();
    if (status === "APPROVED") updateData.approvedAt = new Date();
  }
  if (discount !== undefined) {
    updateData.discount = discount;
    // Recalculate final amount
    const estimate = await prisma.estimate.findUnique({ where: { id } });
    if (estimate) {
      updateData.finalAmount = Number(estimate.totalAmount) * (1 - discount / 100);
    }
  }
  if (notes !== undefined) updateData.notes = notes;

  const estimate = await prisma.estimate.update({
    where: { id },
    data: updateData,
  });

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
