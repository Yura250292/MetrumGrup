import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";

export type FinanceListFilters = {
  projectId?: string | null;
  folderId?: string | null;
  type?: "INCOME" | "EXPENSE";
  kind?: "PLAN" | "FACT";
  status?: "DRAFT" | "PENDING" | "APPROVED" | "PAID";
  source?: "MANUAL" | "ESTIMATE_AUTO";
  category?: string;
  subcategory?: string;
  costCodeId?: string;
  costType?: "MATERIAL" | "LABOR" | "SUBCONTRACT" | "EQUIPMENT" | "OVERHEAD" | "OTHER";
  counterpartyId?: string;
  from?: Date;
  to?: Date;
  responsibleId?: string;
  search?: string;
  hasAttachments?: boolean;
  archived: boolean;
  /** Обмеження по фірмі (Metrum Group / Metrum Studio). null = без обмеження. */
  firmId?: string | null;
};

export function parseListParams(
  searchParams: URLSearchParams,
  firmId: string | null = null,
): FinanceListFilters {
  const projectIdRaw = searchParams.get("projectId");
  const typeRaw = searchParams.get("type");
  const kindRaw = searchParams.get("kind");
  const category = searchParams.get("category") ?? undefined;
  const subcategory = searchParams.get("subcategory") ?? undefined;
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const responsibleId = searchParams.get("responsibleId") ?? undefined;
  const search = searchParams.get("search")?.trim() || undefined;
  const hasAttachmentsRaw = searchParams.get("hasAttachments");
  const archivedRaw = searchParams.get("archived");
  const statusRaw = searchParams.get("status");
  const sourceRaw = searchParams.get("source");

  const folderIdRaw = searchParams.get("folderId");
  const costCodeIdRaw = searchParams.get("costCodeId") ?? undefined;
  const costTypeRaw = searchParams.get("costType");
  const counterpartyIdRaw = searchParams.get("counterpartyId") ?? undefined;
  const validCostTypes = ["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"] as const;
  type CostTypeKey = (typeof validCostTypes)[number];
  const costType =
    costTypeRaw && validCostTypes.includes(costTypeRaw as CostTypeKey)
      ? (costTypeRaw as CostTypeKey)
      : undefined;

  return {
    projectId:
      projectIdRaw === null
        ? undefined
        : projectIdRaw === "null" || projectIdRaw === ""
          ? null
          : projectIdRaw,
    folderId: folderIdRaw ?? undefined,
    type: typeRaw === "INCOME" || typeRaw === "EXPENSE" ? typeRaw : undefined,
    kind: kindRaw === "PLAN" || kindRaw === "FACT" ? kindRaw : undefined,
    category: category && FINANCE_CATEGORY_LABELS[category] ? category : undefined,
    subcategory,
    from: fromRaw ? new Date(fromRaw) : undefined,
    to: toRaw ? new Date(toRaw) : undefined,
    responsibleId,
    search,
    hasAttachments:
      hasAttachmentsRaw === "true" ? true : hasAttachmentsRaw === "false" ? false : undefined,
    status:
      statusRaw === "DRAFT" || statusRaw === "PENDING" || statusRaw === "APPROVED" || statusRaw === "PAID"
        ? statusRaw
        : undefined,
    source:
      sourceRaw === "MANUAL" || sourceRaw === "ESTIMATE_AUTO" ? sourceRaw : undefined,
    costCodeId: costCodeIdRaw,
    costType,
    counterpartyId: counterpartyIdRaw,
    archived: archivedRaw === "true",
    firmId,
  };
}

/**
 * Walks the finance folder tree and returns the given folderId plus all
 * descendants. Used so a parent folder view (e.g. "Avalon") aggregates
 * entries from its sub-folders (e.g. "Holiday (2 phase)").
 */
async function collectFinanceFolderDescendants(rootId: string): Promise<string[]> {
  const allFolders = await prisma.folder.findMany({
    where: { domain: "FINANCE" },
    select: { id: true, parentId: true },
  });
  const childrenMap = new Map<string, string[]>();
  for (const f of allFolders) {
    if (f.parentId) {
      const arr = childrenMap.get(f.parentId) ?? [];
      arr.push(f.id);
      childrenMap.set(f.parentId, arr);
    }
  }
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.push(id);
    const kids = childrenMap.get(id);
    if (kids) stack.push(...kids);
  }
  return result;
}

/**
 * When user is inside a folder, they often expect to see:
 *   - entries in this folder AND all descendant folders
 *   - legacy project-level entries (folderId IS NULL) whose project is
 *     already tied to this folder subtree via another entry/estimate
 * Expands the strict `folderId = X` match into:
 *   folderId IN descendants(X)  OR  (folderId IS NULL AND projectId IN S)
 * Only runs when folderId is set; otherwise falls back to the plain buildWhere.
 */
export async function expandFolderFilter(
  filters: FinanceListFilters,
): Promise<Prisma.FinanceEntryWhereInput> {
  if (!filters.folderId) return buildWhere(filters);

  const base = buildWhere({ ...filters, folderId: undefined });

  const descendantIds = await collectFinanceFolderDescendants(filters.folderId);

  const [estimateProjects, entryProjects] = await Promise.all([
    prisma.estimate.findMany({
      where: {
        folderId: { in: descendantIds },
        projectId: { not: "" },
        ...(filters.firmId ? { project: { firmId: filters.firmId } } : {}),
      },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
    prisma.financeEntry.findMany({
      where: {
        folderId: { in: descendantIds },
        projectId: { not: null },
        ...(filters.firmId ? { firmId: filters.firmId } : {}),
      },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
  ]);

  const projectIds = Array.from(
    new Set(
      [
        ...estimateProjects.map((e) => e.projectId),
        ...entryProjects.map((e) => e.projectId),
      ].filter((id): id is string => !!id),
    ),
  );

  const folderClause: Prisma.FinanceEntryWhereInput =
    projectIds.length === 0
      ? { folderId: { in: descendantIds } }
      : {
          OR: [
            { folderId: { in: descendantIds } },
            { AND: [{ folderId: null }, { projectId: { in: projectIds } }] },
          ],
        };

  return { AND: [base, folderClause] };
}

export function buildWhere(filters: FinanceListFilters): Prisma.FinanceEntryWhereInput {
  const where: Prisma.FinanceEntryWhereInput = {
    isArchived: filters.archived,
  };

  if (filters.projectId !== undefined) {
    where.projectId = filters.projectId;
  }
  if (filters.folderId !== undefined) {
    where.folderId = filters.folderId;
  }
  if (filters.type) where.type = filters.type;
  if (filters.kind) where.kind = filters.kind;
  if (filters.status) where.status = filters.status;
  if (filters.source) where.source = filters.source;
  if (filters.category) where.category = filters.category;
  if (filters.subcategory) where.subcategory = filters.subcategory;
  if (filters.costCodeId) where.costCodeId = filters.costCodeId;
  if (filters.costType) where.costType = filters.costType;
  if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;
  if (filters.responsibleId) where.createdById = filters.responsibleId;

  if (filters.from || filters.to) {
    where.occurredAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  if (filters.hasAttachments === true) {
    where.attachments = { some: {} };
  } else if (filters.hasAttachments === false) {
    where.attachments = { none: {} };
  }

  if (filters.search) {
    const needle = filters.search;
    where.OR = [
      { title: { contains: needle, mode: "insensitive" } },
      { description: { contains: needle, mode: "insensitive" } },
      { counterparty: { contains: needle, mode: "insensitive" } },
    ];
  }

  if (filters.firmId) {
    where.firmId = filters.firmId;
  }

  return where;
}

export type FinanceQuadrantStats = {
  sum: number;
  count: number;
};

export type FinanceSummary = {
  plan: { income: FinanceQuadrantStats; expense: FinanceQuadrantStats };
  fact: { income: FinanceQuadrantStats; expense: FinanceQuadrantStats };
  balance: number;
  count: number;
};

const EMPTY_STATS: FinanceQuadrantStats = { sum: 0, count: 0 };

export async function computeSummary(where: Prisma.FinanceEntryWhereInput): Promise<FinanceSummary> {
  const grouped = await prisma.financeEntry.groupBy({
    by: ["kind", "type"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });

  const quadrants: Record<string, FinanceQuadrantStats> = {};
  let total = 0;
  for (const g of grouped) {
    const key = `${g.kind}:${g.type}`;
    quadrants[key] = { sum: Number(g._sum.amount ?? 0), count: g._count._all };
    total += g._count._all;
  }

  const plan = {
    income: quadrants["PLAN:INCOME"] ?? EMPTY_STATS,
    expense: quadrants["PLAN:EXPENSE"] ?? EMPTY_STATS,
  };
  const fact = {
    income: quadrants["FACT:INCOME"] ?? EMPTY_STATS,
    expense: quadrants["FACT:EXPENSE"] ?? EMPTY_STATS,
  };

  return {
    plan,
    fact,
    balance: fact.income.sum - fact.expense.sum,
    count: total,
  };
}

export const FINANCE_ENTRY_SELECT = {
  id: true,
  occurredAt: true,
  kind: true,
  type: true,
  amount: true,
  currency: true,
  projectId: true,
  firmId: true,
  folderId: true,
  category: true,
  subcategory: true,
  title: true,
  description: true,
  counterparty: true,
  counterpartyId: true,
  costCodeId: true,
  costType: true,
  isArchived: true,
  status: true,
  approvedAt: true,
  remindAt: true,
  approvedById: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  source: true,
  estimateId: true,
  estimateItemId: true,
  project: { select: { id: true, title: true, slug: true } },
  folder: { select: { id: true, name: true } },
  estimate: { select: { id: true, number: true, title: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  counterpartyEntity: { select: { id: true, name: true, type: true } },
  costCode: { select: { id: true, code: true, name: true } },
  attachments: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      r2Key: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.FinanceEntryDefaultArgs["select"];
