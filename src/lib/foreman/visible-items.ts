import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/// Кого вважати "effective foreman" позиції кошторису:
///   1) item.foremanId (явне призначення на позиції)
///   2) ProjectStageRecord.responsibleUserId — для stage-запису, що
///      походить з тієї ж секції (sourceEstimateSectionId).
///   3) null — позиція без відповідального за звіт.
///
/// Поточна реалізація рахує лише прямий зв'язок section→stage. Не лізе
/// по дереву parentStageId — це справа окремої утиліти (P2).
export async function getEffectiveForemanId(
  estimateItemId: string,
): Promise<string | null> {
  const item = await prisma.estimateItem.findUnique({
    where: { id: estimateItemId },
    select: { foremanId: true, sectionId: true },
  });
  if (!item) return null;
  if (item.foremanId) return item.foremanId;
  if (!item.sectionId) return null;
  const stage = await prisma.projectStageRecord.findFirst({
    where: { sourceEstimateSectionId: item.sectionId },
    select: { responsibleUserId: true },
  });
  return stage?.responsibleUserId ?? null;
}

/// Які EstimateItem видимі для FOREMAN-юзера у даному проєкті:
///   1) позиції, де foremanId == userId, АБО
///   2) позиції без явного foremanId, але у секції з stage record, де
///      responsibleUserId == userId.
///
/// ДКО-блокування ще не реалізоване (потребує FK estimateItem→ChangeOrderItem,
/// P2). Поки що повертаємо повний список — менеджер контролює видимість
/// через статус кошторису і `isActive`.
export function visibleEstimateItemsWhere(
  projectId: string,
  foremanUserId: string,
): Prisma.EstimateItemWhereInput {
  return {
    estimate: { projectId },
    OR: [
      { foremanId: foremanUserId },
      {
        foremanId: null,
        section: {
          stageRecords: {
            some: { responsibleUserId: foremanUserId },
          },
        },
      },
    ],
  };
}

/// Чи має foreman доступ хоча б до однієї позиції цього проєкту?
/// Використовується для фільтра "Мої проєкти" у /foreman UI.
export async function foremanHasAccessToProject(
  projectId: string,
  foremanUserId: string,
): Promise<boolean> {
  const found = await prisma.estimateItem.findFirst({
    where: visibleEstimateItemsWhere(projectId, foremanUserId),
    select: { id: true },
  });
  return found !== null;
}
