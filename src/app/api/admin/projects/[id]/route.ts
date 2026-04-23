import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { addProjectMember, deactivateMember } from "@/lib/projects/members-service";
import { notifyProjectMembers } from "@/lib/notifications/create";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const [project, responsibleCandidates] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        manager: { select: { id: true, name: true, email: true, phone: true } },
        stages: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { scheduledDate: "asc" } },
        estimates: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "MANAGER", "ENGINEER"] }, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!project) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  return NextResponse.json({ data: project, responsibleCandidates });
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
  const { title, description, address, status, currentStage, stageProgress, managerId, totalBudget, totalPaid, startDate, expectedEndDate, actualEndDate, coverImageUrl } = body;

  // Read previous managerId to know if we need to sync ProjectMember
  const previous = await prisma.project.findUnique({
    where: { id },
    select: { managerId: true, status: true, currentStage: true, title: true },
  });
  if (!previous) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (address !== undefined) updateData.address = address;
  if (status !== undefined) updateData.status = status;
  if (currentStage !== undefined) updateData.currentStage = currentStage;
  if (stageProgress !== undefined) updateData.stageProgress = stageProgress;
  if (managerId !== undefined) updateData.managerId = managerId || null;
  if (totalBudget !== undefined) updateData.totalBudget = totalBudget;
  if (totalPaid !== undefined) updateData.totalPaid = totalPaid;
  if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
  if (expectedEndDate !== undefined) updateData.expectedEndDate = expectedEndDate ? new Date(expectedEndDate) : null;
  if (actualEndDate !== undefined) updateData.actualEndDate = actualEndDate ? new Date(actualEndDate) : null;
  if (coverImageUrl !== undefined) updateData.coverImageUrl = coverImageUrl || null;

  const project = await prisma.project.update({
    where: { id },
    data: updateData,
  });

  // Sync ProjectMember when manager changed
  if (managerId !== undefined) {
    const newManagerId = managerId || null;
    if (previous.managerId !== newManagerId) {
      try {
        if (previous.managerId) {
          await deactivateMember(id, previous.managerId);
        }
        if (newManagerId) {
          await addProjectMember({
            projectId: id,
            userId: newManagerId,
            roleInProject: "PROJECT_MANAGER",
            invitedById: session.user.id,
          });
        }
      } catch (err) {
        console.error("Failed to sync project manager membership:", err);
      }
    }
  }

  await auditLog({
    userId: session.user.id,
    action: "UPDATE",
    entity: "Project",
    entityId: id,
    projectId: id,
    newData: updateData,
  });

  // Notify project members about meaningful changes (status / stage / manager).
  // Best-effort: failures must not fail the PATCH.
  try {
    const changedParts: string[] = [];
    if (status !== undefined && status !== previous.status) {
      changedParts.push(`статус → ${status}`);
    }
    if (currentStage !== undefined && currentStage !== previous.currentStage) {
      changedParts.push(`етап → ${currentStage}`);
    }
    if (managerId !== undefined && (managerId || null) !== previous.managerId) {
      changedParts.push("менеджер змінено");
    }
    if (changedParts.length > 0) {
      await notifyProjectMembers({
        projectId: id,
        actorId: session.user.id,
        type: "PROJECT_UPDATED",
        title: `Оновлено проєкт «${previous.title}»`,
        body: changedParts.join(", "),
        relatedEntity: "Project",
        relatedId: id,
      });
    }
  } catch (err) {
    console.error("[projects/PATCH] notifyProjectMembers failed:", err);
  }

  return NextResponse.json({ data: project });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Тільки SUPER_ADMIN видаляє проекти. MANAGER не отримує право, бо delete
  // каскадно зносить всі estimates / payments / files / chat / members.
  if (session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
    }

    // Дві FK на Project не мають onDelete: Cascade у схемі —
    // inventory_transactions.projectId і audit_logs.projectId. Обидва
    // nullable, тому просто null-имо їх до delete.
    await prisma.$transaction(async (tx) => {
      await tx.inventoryTransaction.updateMany({
        where: { projectId: id },
        data: { projectId: null },
      });
      // audit_logs модель — використовуємо raw SQL бо назва Prisma-моделі
      // може відрізнятися від snake_case таблиці.
      await tx.$executeRaw`UPDATE "audit_logs" SET "projectId" = NULL WHERE "projectId" = ${id}`;

      await tx.project.delete({ where: { id } });
    });

    await auditLog({
      userId: session.user.id,
      action: "DELETE",
      entity: "Project",
      entityId: id,
      oldData: { title: existing.title },
    });

    return NextResponse.json({
      success: true,
      message: "Проєкт успішно видалено",
    });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Помилка видалення: ${error.message}`
            : "Помилка видалення проєкту",
      },
      { status: 500 }
    );
  }
}
