import { prisma } from "@/lib/prisma";
import { DEFAULT_FIRM_ID } from "@/lib/firm/scope";
import { seedProjectTaskDefaults } from "./defaults";
import { enableTasksForProject } from "./feature-flag";

const INBOX_PROJECT_TITLE = "Особисті задачі";
const INBOX_STAGE_NAME = "Загальне";

export type PersonalInbox = {
  projectId: string;
  defaultStageId: string;
};

/**
 * Повертає (створюючи за потреби) персональний "Inbox" проєкт для користувача.
 * Використовується коли користувач додає задачу без явного проєкту.
 *
 * Гарантії:
 *  - Один Inbox на користувача (унікальний індекс `personalInboxUserId`).
 *  - `isInternal=true`, але приватний — `getProjectAccessContext` блокує
 *    доступ для всіх інших користувачів (incl. SUPER_ADMIN).
 *  - Має одну default стадію "Загальне" і дефолтні TaskStatus'и.
 *  - Належить тій же фірмі (`firmId`), що й користувач (multi-firm isolation).
 *  - Завжди є запис у ProjectMember (PROJECT_ADMIN) — для consistency з рештою
 *    коду, що очікує member-record.
 */
export async function getOrCreatePersonalInbox(
  userId: string,
): Promise<PersonalInbox> {
  const existing = await prisma.project.findUnique({
    where: { personalInboxUserId: userId },
    select: {
      id: true,
      stages: {
        select: { id: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  });

  if (existing) {
    const stage = existing.stages[0];
    if (stage) {
      return { projectId: existing.id, defaultStageId: stage.id };
    }
    // edge case: project lost its stage — recreate
    const created = await prisma.projectStageRecord.create({
      data: {
        projectId: existing.id,
        customName: INBOX_STAGE_NAME,
        sortOrder: 0,
      },
      select: { id: true },
    });
    return { projectId: existing.id, defaultStageId: created.id };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firmId: true, role: true },
  });
  if (!user) {
    throw new Error(`User ${userId} not found — cannot create Personal Inbox`);
  }
  if (user.role === "CLIENT") {
    throw new Error("CLIENT users do not have a Personal Inbox");
  }

  const firmId = user.firmId ?? DEFAULT_FIRM_ID;
  // Slug must be unique у `Project.slug` — додаємо timestamp на випадок гонки.
  const slug = `inbox-${userId.slice(0, 12)}-${Date.now().toString(36)}`;

  const project = await prisma.project.create({
    data: {
      title: INBOX_PROJECT_TITLE,
      slug,
      isInternal: true,
      personalInboxUserId: userId,
      firmId,
      status: "ACTIVE",
      stages: {
        create: { customName: INBOX_STAGE_NAME, sortOrder: 0 },
      },
      members: {
        create: { userId, roleInProject: "PROJECT_ADMIN" },
      },
    },
    select: {
      id: true,
      stages: { select: { id: true }, take: 1, orderBy: { sortOrder: "asc" } },
    },
  });

  await seedProjectTaskDefaults(project.id);
  // Best-effort — global flag може бути true, тоді цей виклик no-op'иться.
  try {
    await enableTasksForProject(project.id);
  } catch {
    // ignore — feature flag не повинен валити створення Inbox
  }

  const stage = project.stages[0];
  if (!stage) {
    throw new Error("Personal Inbox created without a default stage");
  }
  return { projectId: project.id, defaultStageId: stage.id };
}

/**
 * Чи є цей projectId — персональним Inbox'ом конкретного користувача.
 * Використовується UI'ом щоб показати запис як "Без проєкту" замість назви проєкту.
 */
export async function isPersonalInboxOf(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { personalInboxUserId: true },
  });
  return project?.personalInboxUserId === userId;
}
