import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/estimates/[id]/set-finance-review
 *
 * Переводить кошторис в статус FINANCE_REVIEW для налаштування фінансистом
 * Доступ: SUPER_ADMIN, MANAGER, ENGINEER
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const role = session.user.role;
  if (!["SUPER_ADMIN", "MANAGER", "ENGINEER"].includes(role)) {
    return forbiddenResponse();
  }

  try {
    const estimate = await prisma.estimate.findUnique({
      where: { id: params.id },
      select: { id: true, number: true, title: true, status: true },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Кошторис не знайдено" },
        { status: 404 }
      );
    }

    const updated = await prisma.estimate.update({
      where: { id: params.id },
      data: { status: "FINANCE_REVIEW" },
      select: { id: true, number: true, title: true, status: true },
    });

    // Логування
    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Estimate",
        entityId: estimate.id,
        userId: session.user.id,
        oldData: { status: estimate.status },
        newData: { status: "FINANCE_REVIEW" },
      },
    });

    return NextResponse.json({
      success: true,
      estimate: updated,
      message: `Кошторис ${updated.number} переведено в статус FINANCE_REVIEW`,
    });
  } catch (error: any) {
    console.error("Error setting finance review:", error);
    return NextResponse.json(
      { error: error.message || "Помилка оновлення" },
      { status: 500 }
    );
  }
}
