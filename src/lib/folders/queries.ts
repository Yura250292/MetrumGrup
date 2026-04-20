import { prisma } from "@/lib/prisma";
import type { FolderDomain } from "@prisma/client";

export type FolderListItem = {
  id: string;
  name: string;
  color: string | null;
  domain: FolderDomain;
  parentId: string | null;
  sortOrder: number;
  isSystem: boolean;
  slug: string | null;
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
    isSystem: f.isSystem,
    slug: f.slug,
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

/**
 * Collect all descendant folder IDs for a set of folder IDs (recursive).
 */
async function collectDescendantIds(folderIds: string[]): Promise<Map<string, string[]>> {
  // Fetch ALL finance folders in one query (they're usually few)
  const allFolders = await prisma.folder.findMany({
    where: { domain: "FINANCE" },
    select: { id: true, parentId: true },
  });

  // Build parent→children map
  const childrenMap = new Map<string, string[]>();
  for (const f of allFolders) {
    if (f.parentId) {
      const arr = childrenMap.get(f.parentId) ?? [];
      arr.push(f.id);
      childrenMap.set(f.parentId, arr);
    }
  }

  // For each requested folder, walk its subtree
  const result = new Map<string, string[]>();
  for (const rootId of folderIds) {
    const descendants: string[] = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      descendants.push(id);
      const children = childrenMap.get(id);
      if (children) stack.push(...children);
    }
    result.set(rootId, descendants);
  }

  return result;
}

export async function computeFinanceFolderSummaries(
  folderIds: string[],
): Promise<Map<string, { income: number; expense: number; balance: number }>> {
  // Collect all descendant folder IDs so each folder total includes sub-folders
  const descendantsMap = await collectDescendantIds(folderIds);

  // Gather ALL folder IDs we need to query
  const allIds = new Set<string>();
  for (const ids of descendantsMap.values()) {
    for (const id of ids) allIds.add(id);
  }

  // Single groupBy query for all relevant folders
  const grouped = await prisma.financeEntry.groupBy({
    by: ["folderId", "type"],
    where: {
      folderId: { in: [...allIds] },
      isArchived: false,
    },
    _sum: { amount: true },
  });

  // Build per-folder sums
  const perFolder = new Map<string, { income: number; expense: number }>();
  for (const row of grouped) {
    if (!row.folderId) continue;
    const existing = perFolder.get(row.folderId) ?? { income: 0, expense: 0 };
    const amount = Number(row._sum.amount ?? 0);
    if (row.type === "INCOME") {
      existing.income = amount;
    } else {
      existing.expense = amount;
    }
    perFolder.set(row.folderId, existing);
  }

  // Aggregate: for each requested folder, sum itself + all descendants
  const result = new Map<string, { income: number; expense: number; balance: number }>();
  for (const rootId of folderIds) {
    const descendants = descendantsMap.get(rootId) ?? [rootId];
    let income = 0;
    let expense = 0;
    for (const id of descendants) {
      const sums = perFolder.get(id);
      if (sums) {
        income += sums.income;
        expense += sums.expense;
      }
    }
    result.set(rootId, { income, expense, balance: income - expense });
  }

  return result;
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
