import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { addProjectMember, deactivateMember } from "@/lib/projects/members-service";
import { notifyProjectMembers } from "@/lib/notifications/create";
import {
  updateProjectMirror,
  syncProjectBudgetEntry,
} from "@/lib/folders/mirror-service";
import { computeStageFinanceAggregates } from "@/lib/projects/stages-helpers";

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
        stages: {
          orderBy: { sortOrder: "asc" },
          include: {
            responsibleUser: { select: { id: true, name: true } },
          },
        },
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

  const stageRows = project.stages;
  if (stageRows.length > 0) {
    const aggregates = await computeStageFinanceAggregates(id, stageRows);
    const augmented = stageRows.map((s) => ({
      ...s,
      ...(aggregates.get(s.id) ?? {
        planExpense: 0,
        factExpense: 0,
        planIncome: 0,
        factIncome: 0,
      }),
    }));
    return NextResponse.json({
      data: { ...project, stages: augmented },
      responsibleCandidates,
    });
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
  const {
    title,
    description,
    address,
    status,
    currentStage,
    stageProgress,
    managerId,
    clientId,
    clientCounterpartyId,
    clientName,
    totalBudget,
    totalPaid,
    startDate,
    expectedEndDate,
    actualEndDate,
    coverImageUrl,
    isTestProject,
  } = body;

  // Read previous managerId to know if we need to sync ProjectMember
  const previous = await prisma.project.findUnique({
    where: { id },
    select: {
      managerId: true,
      status: true,
      currentStage: true,
      title: true,
      folderId: true,
      totalBudget: true,
      isTestProject: true,
      firmId: true,
    },
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
  if (isTestProject !== undefined) updateData.isTestProject = Boolean(isTestProject);

  // Client editing: підтримуємо три варіанти — User-FK, Counterparty-FK,
  // free-text. Якщо вказано counterparty — підтягуємо snapshot його імені
  // у clientName (швидкий рендер списків без додаткового join).
  if (clientId !== undefined) updateData.clientId = clientId || null;
  if (clientCounterpartyId !== undefined) {
    if (clientCounterpartyId) {
      const cp = await prisma.counterparty.findUnique({
        where: { id: String(clientCounterpartyId) },
        select: { id: true, name: true, firmId: true },
      });
      if (!cp) {
        return NextResponse.json({ error: "Контрагент не існує" }, { status: 400 });
      }
      if (cp.firmId && previous.firmId && cp.firmId !== previous.firmId) {
        return NextResponse.json(
          { error: "Контрагент належить іншій фірмі" },
          { status: 400 },
        );
      }
      updateData.clientCounterpartyId = cp.id;
      // Снепшот імені, тільки якщо явно не передали clientName.
      if (clientName === undefined) updateData.clientName = cp.name;
    } else {
      updateData.clientCounterpartyId = null;
    }
  }
  if (clientName !== undefined) {
    const trimmed = typeof clientName === "string" ? clientName.trim() : "";
    updateData.clientName = trimmed || null;
  }

  const project = await prisma.project.update({
    where: { id },
    data: updateData,
  });

  // Sync FINANCE-mirror (назва/parent) + auto PROJECT_BUDGET FinanceEntry
  try {
    const titleChanged = title !== undefined && title !== previous.title;
    if (titleChanged) {
      await updateProjectMirror(id);
    }
    const budgetChanged =
      totalBudget !== undefined && Number(totalBudget) !== Number(previous.totalBudget);
    const testFlagChanged =
      isTestProject !== undefined && Boolean(isTestProject) !== Boolean(previous.isTestProject);
    if (budgetChanged || testFlagChanged) {
      await syncProjectBudgetEntry(id, session.user.id);
    }
  } catch (err) {
    console.error("Failed to sync project mirror/budget:", err);
  }

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

    // Phase 3+: видалення проєкту = повне очищення всіх його даних.
    // Раніше FinanceEntry.projectId мав SetNull — записи лишалися як
    // "projectless" і фігурували у зведенні фінансування навіть після
    // видалення проєкту. Тепер видаляємо явно перед project.delete.
    //
    // FK без onDelete-політики:
    //   - Equipment.currentProjectId — null-имо (обладнання — асет, виживає)
    //   - InventoryTransaction.projectId — null-имо (історія транзакцій
    //     виживає, але без прив'язки)
    //   - AuditLog.projectId — null-имо (audit log зберігаємо)
    await prisma.$transaction(async (tx) => {
      // 1. Усі фінансові записи проєкту — STAGE_AUTO, ESTIMATE_AUTO,
      //    PROJECT_BUDGET, MANUAL. Видаляються повністю; FinanceEntryAttachment
      //    каскадно (FK Cascade); Timesheet/KB2/ReceiptScan/Retention мають
      //    SetNull на financeEntryId — їх заберемо нижче через project Cascade.
      await tx.financeEntry.deleteMany({ where: { projectId: id } });

      // 2. Mirror-папка проєкту у "Проєкти". Тепер просто видаляємо — записи
      //    у ній уже видалили попереднім кроком.
      await tx.folder.deleteMany({ where: { mirroredFromProjectId: id } });

      // 3. FK без onDelete-політики — null-имо вручну, інакше delete зафейлить.
      await tx.equipment.updateMany({
        where: { currentProjectId: id },
        data: { currentProjectId: null },
      });
      await tx.inventoryTransaction.updateMany({
        where: { projectId: id },
        data: { projectId: null },
      });
      await tx.$executeRaw`UPDATE "audit_logs" SET "projectId" = NULL WHERE "projectId" = ${id}`;

      // 4. project.delete каскадно зносить решту: stages, estimates, payments,
      //    members, tasks, conversations, files, KB2/3, etc.
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
