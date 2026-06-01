/**
 * Перевірка готовності проєкту до запуску (P1/P4) та закриття (P11).
 *
 * Бізнес-правило запуску: проєкт не можна перевести у ACTIVE, поки немає
 * погодженого/замороженого плану робіт. Конкретно:
 *   1) є хоча б один кошторис;
 *   2) активна версія кошторису заморожена (isLocked = true);
 *   3) є хоча б один розділ (EstimateSection);
 *   4) є хоча б одна reportable-робота (itemType ≠ material);
 *   5) усі reportable-роботи мають effective foreman.
 *
 * Закриття: усі stage-розділи проєкту мають бути COMPLETED.
 */
import { prisma } from "@/lib/prisma";
import { getEffectiveForemanId } from "@/lib/foreman/visible-items";

/** Робота, по якій виконроб звітує (не матеріал). */
export function isReportableItemType(itemType: string | null | undefined): boolean {
  return itemType !== "material";
}

export type ActivationReadiness = {
  ok: boolean;
  checks: {
    hasEstimate: boolean;
    hasLockedVersion: boolean;
    hasSection: boolean;
    hasWork: boolean;
    allWorkHaveForeman: boolean;
  };
  /** Reportable-роботи без effective foreman (для warning у UI). */
  missingForemanItems: { id: string; description: string }[];
  reasons: string[];
};

export async function checkProjectActivationReadiness(
  projectId: string,
): Promise<ActivationReadiness> {
  const estimates = await prisma.estimate.findMany({
    where: { projectId },
    select: {
      id: true,
      versions: {
        where: { isActive: true },
        select: { isLocked: true },
        take: 1,
      },
      sections: { select: { id: true }, take: 1 },
      items: {
        select: { id: true, description: true, itemType: true },
      },
    },
  });

  const hasEstimate = estimates.length > 0;
  const hasLockedVersion = estimates.some(
    (e) => e.versions[0]?.isLocked === true,
  );
  const hasSection = estimates.some((e) => e.sections.length > 0);

  const reportableItems = estimates
    .flatMap((e) => e.items)
    .filter((i) => isReportableItemType(i.itemType));
  const hasWork = reportableItems.length > 0;

  // Effective foreman per reportable item. Activate — рідкісна дія,
  // тому послідовний прохід через getEffectiveForemanId прийнятний.
  const missingForemanItems: { id: string; description: string }[] = [];
  for (const item of reportableItems) {
    const foremanId = await getEffectiveForemanId(item.id);
    if (!foremanId) {
      missingForemanItems.push({ id: item.id, description: item.description });
    }
  }
  const allWorkHaveForeman = hasWork && missingForemanItems.length === 0;

  const reasons: string[] = [];
  if (!hasEstimate) reasons.push("Немає кошторису");
  if (!hasLockedVersion) reasons.push("Кошторис не заморожено");
  if (!hasSection) reasons.push("Немає жодного розділу");
  if (!hasWork) reasons.push("Немає жодної роботи");
  if (hasWork && !allWorkHaveForeman)
    reasons.push(
      `Без відповідального: ${missingForemanItems.length} ${
        missingForemanItems.length === 1 ? "робота" : "робіт"
      }`,
    );

  return {
    ok:
      hasEstimate &&
      hasLockedVersion &&
      hasSection &&
      hasWork &&
      allWorkHaveForeman,
    checks: { hasEstimate, hasLockedVersion, hasSection, hasWork, allWorkHaveForeman },
    missingForemanItems,
    reasons,
  };
}

export type CompletionReadiness = {
  ok: boolean;
  totalSections: number;
  incompleteSections: { id: string; name: string }[];
  reasons: string[];
};

/**
 * Готовність до закриття: усі top-level stage-розділи (parentStageId = null)
 * проєкту мають бути COMPLETED. Порожній проєкт (без розділів) закривати не можна.
 */
export async function checkProjectCompletionReadiness(
  projectId: string,
): Promise<CompletionReadiness> {
  const sections = await prisma.projectStageRecord.findMany({
    where: { projectId, parentStageId: null, isHidden: false },
    select: { id: true, status: true, customName: true, stage: true },
  });

  const incompleteSections = sections
    .filter((s) => s.status !== "COMPLETED")
    .map((s) => ({ id: s.id, name: s.customName ?? s.stage ?? "Розділ" }));

  const reasons: string[] = [];
  if (sections.length === 0) reasons.push("Немає жодного розділу");
  if (incompleteSections.length > 0)
    reasons.push(`Незавершені розділи: ${incompleteSections.length}`);

  return {
    ok: sections.length > 0 && incompleteSections.length === 0,
    totalSections: sections.length,
    incompleteSections,
    reasons,
  };
}
