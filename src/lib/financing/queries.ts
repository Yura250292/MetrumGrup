import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";

export type FinanceListFilters = {
  projectId?: string | null;
  type?: "INCOME" | "EXPENSE";
  kind?: "PLAN" | "FACT";
  category?: string;
  subcategory?: string;
  from?: Date;
  to?: Date;
  responsibleId?: string;
  search?: string;
  hasAttachments?: boolean;
  archived: boolean;
};

export function parseListParams(searchParams: URLSearchParams): FinanceListFilters {
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

  return {
    projectId:
      projectIdRaw === null
        ? undefined
        : projectIdRaw === "null" || projectIdRaw === ""
          ? null
          : projectIdRaw,
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
    archived: archivedRaw === "true",
  };
}

export function buildWhere(filters: FinanceListFilters): Prisma.FinanceEntryWhereInput {
  const where: Prisma.FinanceEntryWhereInput = {
    isArchived: filters.archived,
  };

  if (filters.projectId !== undefined) {
    where.projectId = filters.projectId;
  }
  if (filters.type) where.type = filters.type;
  if (filters.kind) where.kind = filters.kind;
  if (filters.category) where.category = filters.category;
  if (filters.subcategory) where.subcategory = filters.subcategory;
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
  category: true,
  subcategory: true,
  title: true,
  description: true,
  counterparty: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, title: true, slug: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
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
