import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { mapItemToFinanceCategory } from "./estimate-mapping";
import { recomputeProjectPlanSource, markProjectProjected } from "@/lib/projects/plan-source";

export type SyncResult = {
  estimateId: string;
  itemsCreated: number;
  itemsUpdated: number;
  itemsArchived: number;
  totalExpense: number;
  totalIncome: number;
  syncedAt: Date;
};

export class EstimateNotFoundError extends Error {
  constructor(id: string) {
    super(`Estimate ${id} not found`);
    this.name = "EstimateNotFoundError";
  }
}

export async function syncEstimateToFinancing(
  estimateId: string,
  userId: string,
): Promise<SyncResult> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      items: { include: { section: true } },
      project: { select: { id: true, startDate: true } },
    },
  });

  if (!estimate) throw new EstimateNotFoundError(estimateId);
  // Local non-null alias so TS keeps narrowing inside nested closures.
  const est = estimate;

  const occurredAt = est.project?.startDate ?? new Date();
  const syncedAt = new Date();

  // CLIENT role → per-item INCOME entries (client payments expected per line)
  // INTERNAL role → per-item EXPENSE entries (our cost per line)
  // STANDALONE role → legacy behavior: per-item EXPENSE + single INCOME of finalClientPrice
  const role = est.role;
  const folderId = est.folderId;

  const result = await prisma.$transaction(async (tx) => {
    // Diff/upsert instead of delete+create — preserves entry IDs, attachments,
    // comments and any costCodeId/costType set by humans on top of legacy data.
    // Stale entries (items removed from estimate) are soft-archived rather than
    // wiped, so the audit trail and estimateItemId references survive.
    const existing = await tx.financeEntry.findMany({
      where: { estimateId, source: "ESTIMATE_AUTO" },
      select: {
        id: true,
        estimateItemId: true,
        amount: true,
        type: true,
        category: true,
        title: true,
        description: true,
        folderId: true,
        isArchived: true,
      },
    });

    // Map item entries by estimateItemId for fast lookup; also keep separate
    // bucket for STANDALONE aggregate income (estimateItemId IS NULL).
    const itemEntryByItemId = new Map<string, (typeof existing)[number]>();
    let aggregateIncomeEntry: (typeof existing)[number] | undefined;
    for (const e of existing) {
      if (e.estimateItemId) itemEntryByItemId.set(e.estimateItemId, e);
      else aggregateIncomeEntry = e;
    }

    let totalExpense = new Prisma.Decimal(0);
    let totalIncome = new Prisma.Decimal(0);
    let itemsCreated = 0;
    let itemsUpdated = 0;
    const seenItemIds = new Set<string>();

    async function upsertItemEntry(
      item: (typeof est.items)[number],
      type: "INCOME" | "EXPENSE",
      category: string,
      titlePrefix: string,
    ) {
      const amount =
        item.useCustomMargin && Number(item.priceWithMargin) > 0
          ? item.priceWithMargin
          : item.amount;

      const title = item.description.slice(0, 200);
      const description = item.section?.title
        ? `${titlePrefix} ${est.number} • ${item.section.title}`
        : `${titlePrefix} ${est.number}`;

      const prev = itemEntryByItemId.get(item.id);
      if (prev) {
        seenItemIds.add(item.id);
        // Only push fields that ESTIMATE_AUTO owns; never overwrite human-set
        // costCodeId / costType / counterpartyId.
        await tx.financeEntry.update({
          where: { id: prev.id },
          data: {
            amount,
            type,
            category,
            title,
            description,
            occurredAt,
            folderId,
            isArchived: false, // un-archive if it was a previously orphaned row that's back
            updatedById: userId,
          },
        });
        itemsUpdated++;
      } else {
        // Seed costCodeId/costType from the estimate item so the new planned
        // entry lands in the right bucket of the budget-vs-actual matrix.
        // On subsequent syncs we deliberately do NOT overwrite these fields
        // (see UPDATE branch above) — the human is the source of truth there.
        await tx.financeEntry.create({
          data: {
            occurredAt,
            kind: "PLAN",
            type,
            source: "ESTIMATE_AUTO",
            isDerived: true,
            amount,
            currency: "UAH",
            projectId: est.projectId,
            folderId,
            category,
            title,
            description,
            status: "DRAFT",
            createdById: userId,
            estimateId,
            estimateItemId: item.id,
            costCodeId: item.costCodeId,
            costType: item.costType,
          },
        });
        itemsCreated++;
      }

      if (type === "INCOME") totalIncome = totalIncome.plus(amount);
      else totalExpense = totalExpense.plus(amount);
    }

    if (role === "CLIENT") {
      for (const item of est.items) {
        await upsertItemEntry(item, "INCOME", "client_advance", "Кошторис клієнта");
      }
    } else {
      for (const item of est.items) {
        await upsertItemEntry(
          item,
          "EXPENSE",
          mapItemToFinanceCategory(item, item.section),
          "Кошторис",
        );
      }

      // STANDALONE: maintain a single aggregate INCOME from finalClientPrice.
      if (role === "STANDALONE") {
        const clientPrice = est.finalClientPrice;
        if (Number(clientPrice) > 0) {
          if (aggregateIncomeEntry) {
            await tx.financeEntry.update({
              where: { id: aggregateIncomeEntry.id },
              data: {
                amount: clientPrice,
                title: `План доходу: ${est.title}`.slice(0, 200),
                description: `Кошторис ${est.number} • finalClientPrice`,
                occurredAt,
                isArchived: false,
                updatedById: userId,
              },
            });
            itemsUpdated++;
            aggregateIncomeEntry = undefined; // mark as handled
          } else {
            await tx.financeEntry.create({
              data: {
                occurredAt,
                kind: "PLAN",
                type: "INCOME",
                source: "ESTIMATE_AUTO",
                isDerived: true,
                amount: clientPrice,
                currency: "UAH",
                projectId: est.projectId,
                category: "client_advance",
                title: `План доходу: ${est.title}`.slice(0, 200),
                description: `Кошторис ${est.number} • finalClientPrice`,
                status: "DRAFT",
                createdById: userId,
                estimateId,
              },
            });
            itemsCreated++;
          }
          totalIncome = totalIncome.plus(clientPrice);
        }
      }
    }

    // Archive entries whose estimate-items disappeared, plus a stale STANDALONE
    // aggregate row when the role moved to CLIENT/INTERNAL.
    const orphanIds = existing
      .filter((e) => {
        if (e.estimateItemId) return !seenItemIds.has(e.estimateItemId);
        return aggregateIncomeEntry?.id === e.id;
      })
      .map((e) => e.id);
    let itemsArchived = 0;
    if (orphanIds.length > 0) {
      const archived = await tx.financeEntry.updateMany({
        where: { id: { in: orphanIds } },
        data: { isArchived: true, updatedById: userId },
      });
      itemsArchived = archived.count;
    }

    await tx.estimate.update({
      where: { id: estimateId },
      data: { financeSyncedAt: syncedAt, financeSyncedById: userId },
    });

    return {
      itemsCreated,
      itemsUpdated,
      itemsArchived,
      totalExpense: totalExpense.toNumber(),
      totalIncome: totalIncome.toNumber(),
    };
  });

  // Phase 2: legacy ESTIMATE_AUTO write-path теж тримає canonical-source
  // прапор у синхронному стані (для проєктів без stage tree planSource=ESTIMATE).
  await recomputeProjectPlanSource(est.projectId);
  // Phase 6.3: bump projection metadata.
  await markProjectProjected(est.projectId, userId);

  await auditLog({
    userId,
    action: "UPDATE",
    entity: "Estimate",
    entityId: estimateId,
    projectId: est.projectId,
    newData: {
      financeSync: {
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsArchived: result.itemsArchived,
        totalExpense: result.totalExpense,
        totalIncome: result.totalIncome,
        syncedAt,
      },
    },
  });

  return {
    estimateId,
    itemsCreated: result.itemsCreated,
    itemsUpdated: result.itemsUpdated,
    itemsArchived: result.itemsArchived,
    totalExpense: result.totalExpense,
    totalIncome: result.totalIncome,
    syncedAt,
  };
}

export type ProjectSyncResult = {
  projectId: string;
  estimatesProcessed: number;
  estimatesSkipped: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsArchived: number;
  totalExpense: number;
  totalIncome: number;
  details: SyncResult[];
  syncedAt: Date;
};

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project ${id} not found`);
    this.name = "ProjectNotFoundError";
  }
}

export async function syncProjectEstimatesToFinancing(
  projectId: string,
  userId: string,
): Promise<ProjectSyncResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) throw new ProjectNotFoundError(projectId);

  const approved = await prisma.estimate.findMany({
    where: { projectId, status: "APPROVED" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const totalEstimates = await prisma.estimate.count({ where: { projectId } });

  const details: SyncResult[] = [];
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let itemsArchived = 0;
  let totalExpense = 0;
  let totalIncome = 0;

  for (const e of approved) {
    const res = await syncEstimateToFinancing(e.id, userId);
    details.push(res);
    itemsCreated += res.itemsCreated;
    itemsUpdated += res.itemsUpdated;
    itemsArchived += res.itemsArchived;
    totalExpense += res.totalExpense;
    totalIncome += res.totalIncome;
  }

  return {
    projectId,
    estimatesProcessed: approved.length,
    estimatesSkipped: totalEstimates - approved.length,
    itemsCreated,
    itemsUpdated,
    itemsArchived,
    totalExpense,
    totalIncome,
    details,
    syncedAt: new Date(),
  };
}
