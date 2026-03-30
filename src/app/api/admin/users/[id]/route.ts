import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// PATCH /api/admin/users/[id] - Update user role (SUPER_ADMIN only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { role, isActive } = body;

    // Validate role
    const validRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER", "USER", "CLIENT"];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Невірна роль користувача" },
        { status: 400 }
      );
    }

    // Prevent changing own role or status
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Ви не можете змінити свою власну роль або статус" },
        { status: 400 }
      );
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(role && { role }),
        ...(typeof isActive === "boolean" && { isActive }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "User",
        entityId: id,
        userId: session.user.id,
        newData: { role, isActive },
      },
    });

    return NextResponse.json({ data: updatedUser });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Помилка оновлення користувача" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[id] - Deactivate user (SUPER_ADMIN only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    const { id } = await params;

    // Prevent deleting own account
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Ви не можете деактивувати свій власний обліковий запис" },
        { status: 400 }
      );
    }

    // Deactivate instead of delete
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        action: "DELETE",
        entity: "User",
        entityId: id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ message: "Користувача деактивовано" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Помилка деактивації користувача" },
      { status: 500 }
    );
  }
}
