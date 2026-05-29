import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { recalcCurrentStage } from "@/lib/projects/stages-helpers";
import { recomputeProjectPlanSource } from "@/lib/projects/plan-source";
import { syncStageAutoFinanceEntries } from "@/lib/projects/stage-auto-finance";
import { copyDraftToPublishedForStages } from "@/lib/projects/publish-stages";
import { isFinanceAutopublishEnabled } from "@/lib/financing/feature-flags";
import {
  syncEstimateItemsToTasks,
  type EstimateToTasksResult,
} from "@/lib/projects/sync-estimate-to-tasks";

export type EstimateToStagesResult = {
  estimateId: string;
  projectId: string;
  sectionsCreated: number;
  sectionsUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  estimateAutoArchived: number;
  syncedAt: Date;
};

/**
 * Імпортує дерево кошторису у дерево ProjectStageRecord.
 *
 *   EstimateSection → top-level ProjectStageRecord
 *   EstimateItem    → child ProjectStageRecord з planVolume / unit /
 *                     planUnitPrice / planClientUnitPrice
 *
 * Re-sync upsertʼить за `sourceEstimateSectionId` / `sourceEstimateItemId`
 * (FK), без створення дублікатів. Поля, які заповнює користувач вручну
 * (status, responsibleUserId, factVolume / factUnit / factUnitPrice /
 * factClientUnitPrice, notes) не перезаписуються — переписуються тільки
 * "плановані" поля з кошторису.
 *
 * Старі плоскі ESTIMATE_AUTO FinanceEntry-записи цього кошторису
 * архівуються (isArchived=true) — їх замінив STAGE_AUTO потік, який
 * автоматично запускається syncStageAutoFinanceEntries по кожному
 * створеному/оновленому стейджу.
 */
export async function syncEstimateToStages(
  estimateId: string,
  userId: string,
): Promise<EstimateToStagesResult> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!estimate) throw new Error(`Estimate ${estimateId} not found`);
  const projectId = estimate.projectId;

  // CLIENT-кошторис → quantity × unitPrice — це планове НАДХОДЖЕННЯ (для
  // замовника). INTERNAL/STANDALONE → це ВИТРАТА (наша собівартість).
  const role = estimate.role;
  const fillsCost = role !== "CLIENT";

  const result = await prisma.$transaction(
    async (tx) => {
      let sectionsCreated = 0;
      let sectionsUpdated = 0;
      let itemsCreated = 0;
      let itemsUpdated = 0;

      // Ще раз: existing stages з прив'язкою до цього кошторису.
      const existing = await tx.projectStageRecord.findMany({
        where: {
          projectId,
          OR: [
            { sourceEstimateSectionId: { in: estimate.sections.map((s) => s.id) } },
            {
              sourceEstimateItemId: {
                in: [
                  ...estimate.items.map((i) => i.id),
                  ...estimate.sections.flatMap((s) => s.items.map((i) => i.id)),
                ],
              },
            },
          ],
        },
        select: {
          id: true,
          sourceEstimateSectionId: true,
          sourceEstimateItemId: true,
        },
      });
      const stageBySectionId = new Map(
        existing
          .filter((s) => s.sourceEstimateSectionId)
          .map((s) => [s.sourceEstimateSectionId!, s.id] as const),
      );
      const stageByItemId = new Map(
        existing
          .filter((s) => s.sourceEstimateItemId)
          .map((s) => [s.sourceEstimateItemId!, s.id] as const),
      );

      // Fallback-адопція: легасі проєкти, де етапи створили вручну (без
      // sourceEstimate*Id), мають згрупуватись під відповідні секції/items
      // за збігом імені. Беремо тільки стейджі без source-link (orphan),
      // нормалізуємо назву (trim+lower), складаємо в чергу — name може
      // повторитися (наприклад «Тип 07.1 (2)»), shift'аємо по черзі.
      const orphans = await tx.projectStageRecord.findMany({
        where: {
          projectId,
          sourceEstimateSectionId: null,
          sourceEstimateItemId: null,
        },
        select: { id: true, customName: true, parentStageId: true },
        orderBy: { sortOrder: "asc" },
      });
      const normalize = (s: string | null | undefined) =>
        (s ?? "").trim().toLowerCase();
      const orphansByName = new Map<string, string[]>();
      for (const o of orphans) {
        const key = normalize(o.customName);
        if (!key) continue;
        const bucket = orphansByName.get(key);
        if (bucket) bucket.push(o.id);
        else orphansByName.set(key, [o.id]);
      }
      const takeOrphan = (name: string): string | null => {
        const bucket = orphansByName.get(normalize(name));
        return bucket && bucket.length > 0 ? (bucket.shift() as string) : null;
      };

      const writeSet = new Set<string>(); // stages, які потрібно re-sync STAGE_AUTO

      // Order base: щоб новостворені стейджі лягали в кінець існуючих root-етапів.
      const lastRootSibling = await tx.projectStageRecord.findFirst({
        where: { projectId, parentStageId: null },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      let nextRootSortOrder = (lastRootSibling?.sortOrder ?? -1) + 1;

      // 1) Sections → top-level stages
      for (const section of estimate.sections) {
        let existingStageId = stageBySectionId.get(section.id);
        const sectionTitle = section.title.slice(0, 200);

        // Адоптуємо orphan із збігом імені — щоб старий плоский етап
        // став батьком для дітей-items замість дубля.
        if (!existingStageId) {
          const adopted = takeOrphan(sectionTitle);
          if (adopted) {
            await tx.projectStageRecord.update({
              where: { id: adopted },
              data: {
                sourceEstimateSectionId: section.id,
                parentStageId: null,
              },
            });
            stageBySectionId.set(section.id, adopted);
            existingStageId = adopted;
          }
        }

        if (existingStageId) {
          await tx.projectStageRecord.update({
            where: { id: existingStageId },
            data: { customName: sectionTitle, isHidden: false },
          });
          sectionsUpdated++;
        } else {
          const created = await tx.projectStageRecord.create({
            data: {
              projectId,
              parentStageId: null,
              customName: sectionTitle,
              status: "PENDING",
              sortOrder: nextRootSortOrder++,
              sourceEstimateSectionId: section.id,
            },
            select: { id: true },
          });
          stageBySectionId.set(section.id, created.id);
          sectionsCreated++;
        }
      }

      // 2) Items у sections → child stages
      for (const section of estimate.sections) {
        const parentStageId = stageBySectionId.get(section.id)!;
        let nextChildSortOrder = await nextSortOrder(tx, projectId, parentStageId);

        for (const item of section.items) {
          await upsertItemStage({
            tx,
            existingStageId: stageByItemId.get(item.id),
            projectId,
            parentStageId,
            item,
            fillsCost,
            sortOrder: nextChildSortOrder++,
            stageByItemId,
            writeSet,
            takeOrphan,
            counters: {
              itemsCreated: () => itemsCreated++,
              itemsUpdated: () => itemsUpdated++,
            },
          });
        }
      }

      // 3) Items без section → top-level stages (rare but possible)
      let nextSectionlessSortOrder = nextRootSortOrder;
      for (const item of estimate.items) {
        if (item.sectionId) continue; // вже оброблено вище
        await upsertItemStage({
          tx,
          existingStageId: stageByItemId.get(item.id),
          projectId,
          parentStageId: null,
          item,
          fillsCost,
          sortOrder: nextSectionlessSortOrder++,
          stageByItemId,
          writeSet,
          takeOrphan,
          counters: {
            itemsCreated: () => itemsCreated++,
            itemsUpdated: () => itemsUpdated++,
          },
        });
      }

      // 4) Архівуємо старі плоскі ESTIMATE_AUTO записи цього кошторису —
      //    STAGE_AUTO замінив їх. Лишаємо як archive щоб не втратити audit.
      const archived = await tx.financeEntry.updateMany({
        where: {
          estimateId,
          source: "ESTIMATE_AUTO",
          isArchived: false,
        },
        data: { isArchived: true, updatedById: userId },
      });

      // 5) Маркуємо estimate як synced
      await tx.estimate.update({
        where: { id: estimateId },
        data: {
          financeSyncedAt: new Date(),
          financeSyncedById: userId,
        },
      });

      return {
        sectionsCreated,
        sectionsUpdated,
        itemsCreated,
        itemsUpdated,
        estimateAutoArchived: archived.count,
        writeSet,
      };
    },
    { timeout: 30_000 },
  );

  await recalcCurrentStage(projectId, { syncBudget: true, userId });

  // Phase 2: після того як stage tree наповнено з кошторису, він стає
  // canonical layer для плану — оновлюємо прапор Project.planSource.
  await recomputeProjectPlanSource(projectId);

  // Phase 3: conditional auto-publish.
  // Якщо проєкт ніколи не публікувався (publicationVersion=0) — це первинний
  // імпорт кошторису, нема чого ламати. Копіюємо draft→published і одразу
  // синхронізуємо STAGE_AUTO FinanceEntry, щоб користувач отримав звіти
  // без зайвого кліку.
  // Якщо publicationVersion>0 — проєкт уже мав публікацію. Re-sync кошторису
  // лишає зміни у drafts, користувач вирішить коли публікувати.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { publicationVersion: true },
  });
  const writtenStageIds = Array.from(result.writeSet);
  // Safe Finance Migration Phase 1: first-time auto-publish gated by flag.
  // OFF: stage tree оновлюється у draft, але STAGE_AUTO FinanceEntry не
  // створюються — потрібна явна публікація через окремий ендпойнт.
  if (
    isFinanceAutopublishEnabled()
    && project
    && project.publicationVersion === 0
    && writtenStageIds.length > 0
  ) {
    await copyDraftToPublishedForStages(writtenStageIds);
    for (const stageId of writtenStageIds) {
      await syncStageAutoFinanceEntries(stageId, userId);
    }
  }

  await auditLog({
    userId,
    action: "UPDATE",
    entity: "Estimate",
    entityId: estimateId,
    projectId,
    newData: {
      estimateToStages: {
        sectionsCreated: result.sectionsCreated,
        sectionsUpdated: result.sectionsUpdated,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        estimateAutoArchived: result.estimateAutoArchived,
      },
    },
  });

  return {
    estimateId,
    projectId,
    sectionsCreated: result.sectionsCreated,
    sectionsUpdated: result.sectionsUpdated,
    itemsCreated: result.itemsCreated,
    itemsUpdated: result.itemsUpdated,
    estimateAutoArchived: result.estimateAutoArchived,
    syncedAt: new Date(),
  };
}

async function nextSortOrder(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  projectId: string,
  parentStageId: string | null,
): Promise<number> {
  const last = await tx.projectStageRecord.findFirst({
    where: { projectId, parentStageId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

async function upsertItemStage(args: {
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
  existingStageId: string | undefined;
  projectId: string;
  parentStageId: string | null;
  item: {
    id: string;
    description: string;
    unit: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    priceWithMargin: { toString(): string };
    useCustomMargin: boolean;
  };
  fillsCost: boolean;
  sortOrder: number;
  stageByItemId: Map<string, string>;
  writeSet: Set<string>;
  takeOrphan: (name: string) => string | null;
  counters: { itemsCreated: () => void; itemsUpdated: () => void };
}): Promise<void> {
  const {
    tx,
    projectId,
    parentStageId,
    item,
    fillsCost,
    sortOrder,
    stageByItemId,
    writeSet,
    takeOrphan,
    counters,
  } = args;
  let { existingStageId } = args;

  const customName = item.description.slice(0, 200);

  // Адопція: якщо немає прив'язки по item.id, шукаємо orphan-етап з
  // такою ж назвою і прив'язуємо його як sourceEstimateItemId + ставимо
  // під батьківську секцію.
  if (!existingStageId) {
    const adopted = takeOrphan(customName);
    if (adopted) {
      await tx.projectStageRecord.update({
        where: { id: adopted },
        data: { sourceEstimateItemId: item.id, parentStageId },
      });
      existingStageId = adopted;
      stageByItemId.set(item.id, adopted);
    }
  }
  const planVolume = Number(item.quantity);
  const planUnitPrice = Number(item.unitPrice);
  const clientPrice =
    item.useCustomMargin && Number(item.priceWithMargin) > 0
      ? Number(item.priceWithMargin)
      : planUnitPrice;

  // INTERNAL/STANDALONE: cost у unitPrice, дохід у priceWithMargin.
  // CLIENT: вся "ціна" — це для замовника (немає окремого cost-side).
  const dataAuto: Record<string, unknown> = {
    customName,
    unit: item.unit || null,
    planVolume,
  };
  if (fillsCost) {
    dataAuto.planUnitPrice = planUnitPrice;
    dataAuto.planClientUnitPrice = clientPrice > planUnitPrice ? clientPrice : null;
  } else {
    dataAuto.planUnitPrice = null;
    dataAuto.planClientUnitPrice = planUnitPrice;
  }

  if (existingStageId) {
    await tx.projectStageRecord.update({
      where: { id: existingStageId },
      data: { ...dataAuto, isHidden: false },
    });
    writeSet.add(existingStageId);
    counters.itemsUpdated();
    return;
  }

  const created = await tx.projectStageRecord.create({
    data: {
      projectId,
      parentStageId,
      sortOrder,
      status: "PENDING",
      sourceEstimateItemId: item.id,
      ...dataAuto,
    },
    select: { id: true },
  });
  stageByItemId.set(item.id, created.id);
  writeSet.add(created.id);
  counters.itemsCreated();
}

/**
 * Bulk: всі затверджені кошториси проєкту → стейджі.
 * Кожен кошторис також прокатується через task-sync (за feature-flag),
 * щоб одним вьюзивим викликом отримати і стейджі, і Gantt-задачі.
 */
export async function syncProjectEstimatesToStages(
  projectId: string,
  userId: string,
): Promise<{
  estimatesProcessed: number;
  estimatesSkipped: number;
  details: EstimateToStagesResult[];
  tasksDetails: EstimateToTasksResult[];
}> {
  const approved = await prisma.estimate.findMany({
    where: { projectId, status: "APPROVED" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const total = await prisma.estimate.count({ where: { projectId } });

  const details: EstimateToStagesResult[] = [];
  const tasksDetails: EstimateToTasksResult[] = [];
  for (const e of approved) {
    details.push(await syncEstimateToStages(e.id, userId));
    tasksDetails.push(await syncEstimateItemsToTasks(e.id, userId));
  }

  return {
    estimatesProcessed: approved.length,
    estimatesSkipped: total - approved.length,
    details,
    tasksDetails,
  };
}
