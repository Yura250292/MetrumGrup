import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { mapItemToFinanceCategory } from "./estimate-mapping";

export type SyncResult = {
  estimateId: string;
  itemsCreated: number;
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

  const occurredAt = estimate.project?.startDate ?? new Date();
  const syncedAt = new Date();

  // CLIENT role → per-item INCOME entries (client payments expected per line)
  // INTERNAL role → per-item EXPENSE entries (our cost per line)
  // STANDALONE role → legacy behavior: per-item EXPENSE + single INCOME of finalClientPrice
  const role = estimate.role;

  const result = await prisma.$transaction(async (tx) => {
    await tx.financeEntry.deleteMany({
      where: { estimateId, source: "ESTIMATE_AUTO" },
    });

    let totalExpense = new Prisma.Decimal(0);
    let totalIncome = new Prisma.Decimal(0);

    if (role === "CLIENT") {
      // Each item becomes an INCOME PLAN entry
      for (const item of estimate.items) {
        const amount =
          item.useCustomMargin && Number(item.priceWithMargin) > 0
            ? item.priceWithMargin
            : item.amount;

        await tx.financeEntry.create({
          data: {
            occurredAt,
            kind: "PLAN",
            type: "INCOME",
            source: "ESTIMATE_AUTO",
            amount,
            currency: "UAH",
            projectId: estimate.projectId,
            category: "client_advance",
            title: item.description.slice(0, 200),
            description: item.section?.title
              ? `Кошторис клієнта ${estimate.number} • ${item.section.title}`
              : `Кошторис клієнта ${estimate.number}`,
            status: "DRAFT",
            createdById: userId,
            estimateId,
            estimateItemId: item.id,
          },
        });

        totalIncome = totalIncome.plus(amount);
      }
    } else {
      // INTERNAL or STANDALONE: per-item EXPENSE
      for (const item of estimate.items) {
        const amount =
          item.useCustomMargin && Number(item.priceWithMargin) > 0
            ? item.priceWithMargin
            : item.amount;

        await tx.financeEntry.create({
          data: {
            occurredAt,
            kind: "PLAN",
            type: "EXPENSE",
            source: "ESTIMATE_AUTO",
            amount,
            currency: "UAH",
            projectId: estimate.projectId,
            category: mapItemToFinanceCategory(item, item.section),
            title: item.description.slice(0, 200),
            description: item.section?.title
              ? `Кошторис ${estimate.number} • ${item.section.title}`
              : `Кошторис ${estimate.number}`,
            status: "DRAFT",
            createdById: userId,
            estimateId,
            estimateItemId: item.id,
          },
        });

        totalExpense = totalExpense.plus(amount);
      }

      // STANDALONE: also create a single aggregated INCOME from finalClientPrice
      if (role === "STANDALONE") {
        const clientPrice = estimate.finalClientPrice;
        if (Number(clientPrice) > 0) {
          await tx.financeEntry.create({
            data: {
              occurredAt,
              kind: "PLAN",
              type: "INCOME",
              source: "ESTIMATE_AUTO",
              amount: clientPrice,
              currency: "UAH",
              projectId: estimate.projectId,
              category: "client_advance",
              title: `План доходу: ${estimate.title}`.slice(0, 200),
              description: `Кошторис ${estimate.number} • finalClientPrice`,
              status: "DRAFT",
              createdById: userId,
              estimateId,
            },
          });
          totalIncome = totalIncome.plus(clientPrice);
        }
      }
    }

    await tx.estimate.update({
      where: { id: estimateId },
      data: { financeSyncedAt: syncedAt, financeSyncedById: userId },
    });

    return {
      itemsCreated: estimate.items.length,
      totalExpense: totalExpense.toNumber(),
      totalIncome: totalIncome.toNumber(),
    };
  });

  await auditLog({
    userId,
    action: "UPDATE",
    entity: "Estimate",
    entityId: estimateId,
    projectId: estimate.projectId,
    newData: {
      financeSync: {
        itemsCreated: result.itemsCreated,
        totalExpense: result.totalExpense,
        totalIncome: result.totalIncome,
        syncedAt,
      },
    },
  });

  return {
    estimateId,
    itemsCreated: result.itemsCreated,
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
  let totalExpense = 0;
  let totalIncome = 0;

  for (const e of approved) {
    const res = await syncEstimateToFinancing(e.id, userId);
    details.push(res);
    itemsCreated += res.itemsCreated;
    totalExpense += res.totalExpense;
    totalIncome += res.totalIncome;
  }

  return {
    projectId,
    estimatesProcessed: approved.length,
    estimatesSkipped: totalEstimates - approved.length,
    itemsCreated,
    totalExpense,
    totalIncome,
    details,
    syncedAt: new Date(),
  };
}
