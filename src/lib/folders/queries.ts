import { prisma } from "@/lib/prisma";
import type { FolderDomain } from "@prisma/client";

export type FolderListItem = {
  id: string;
  name: string;
  color: string | null;
  domain: FolderDomain;
  parentId: string | null;
  sortOrder: number;
  createdAt: Date;
  childFolderCount: number;
  itemCount: number;
  finance?: { income: number; expense: number; balance: number };
};

export async function listFolders(
  domain: FolderDomain,
  parentId: string | null,
): Promise<FolderListItem[]> {
  const folders = await prisma.folder.findMany({
    where: { domain, parentId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          children: true,
          projects: domain === "PROJECT" ? true : undefined,
          estimates: domain === "ESTIMATE" ? true : undefined,
          financeEntries: domain === "FINANCE" ? true : undefined,
        },
      },
    },
  });

  const result: FolderListItem[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    domain: f.domain,
    parentId: f.parentId,
    sortOrder: f.sortOrder,
    createdAt: f.createdAt,
    childFolderCount: f._count.children,
    itemCount:
      domain === "PROJECT"
        ? f._count.projects
        : domain === "ESTIMATE"
          ? f._count.estimates
          : f._count.financeEntries,
  }));

  // For FINANCE domain, compute summaries in one batch query
  if (domain === "FINANCE" && result.length > 0) {
    const summaries = await computeFinanceFolderSummaries(
      result.map((f) => f.id),
    );
    for (const folder of result) {
      folder.finance = summaries.get(folder.id) ?? {
        income: 0,
        expense: 0,
        balance: 0,
      };
    }
  }

  return result;
}

export async function computeFinanceFolderSummaries(
  folderIds: string[],
): Promise<Map<string, { income: number; expense: number; balance: number }>> {
  const grouped = await prisma.financeEntry.groupBy({
    by: ["folderId", "type"],
    where: {
      folderId: { in: folderIds },
      isArchived: false,
    },
    _sum: { amount: true },
  });

  const map = new Map<
    string,
    { income: number; expense: number; balance: number }
  >();

  for (const row of grouped) {
    if (!row.folderId) continue;
    const existing = map.get(row.folderId) ?? {
      income: 0,
      expense: 0,
      balance: 0,
    };
    const amount = Number(row._sum.amount ?? 0);
    if (row.type === "INCOME") {
      existing.income = amount;
    } else {
      existing.expense = amount;
    }
    existing.balance = existing.income - existing.expense;
    map.set(row.folderId, existing);
  }

  return map;
}

export type BreadcrumbItem = { id: string; name: string };

export async function getFolderBreadcrumbs(
  folderId: string,
): Promise<BreadcrumbItem[]> {
  const crumbs: BreadcrumbItem[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const found: { id: string; name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
    if (!found) break;
    crumbs.unshift({ id: found.id, name: found.name });
    currentId = found.parentId;
  }

  return crumbs;
}

export async function getFolderTree(
  domain: FolderDomain,
): Promise<
  { id: string; name: string; parentId: string | null; depth: number }[]
> {
  const all = await prisma.folder.findMany({
    where: { domain },
    select: { id: true, name: true, parentId: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // Build tree with depth
  const result: {
    id: string;
    name: string;
    parentId: string | null;
    depth: number;
  }[] = [];

  function walk(parentId: string | null, depth: number) {
    for (const f of all.filter((x) => x.parentId === parentId)) {
      result.push({ id: f.id, name: f.name, parentId: f.parentId, depth });
      walk(f.id, depth + 1);
    }
  }

  walk(null, 0);
  return result;
}
