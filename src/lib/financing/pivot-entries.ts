/**
 * Pivot drill-down — list FinanceEntries that aggregate into a given
 * pivot cell (project × kind × type × category × subcategory × period).
 *
 * Joins estimateItem / foremanReportItem to surface qty + unitPrice + unit
 * when available (so UI can show "85 м² × 380 ₴" not just amount).
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { buildWhere, expandFolderFilter, type FinanceListFilters } from "./queries";

export type PivotEntryDetail = {
  id: string;
  occurredAt: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  counterparty: string | null;
  kind: "PLAN" | "FACT" | "BUDGET" | "COMMITTED";
  type: "INCOME" | "EXPENSE";
  source: string;
  status: string;
  /// Quantity unit (м², м³, шт, год тощо) — from linked estimateItem / foremanReportItem.
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  /// Stage name if linked (для контексту "що це за етап").
  stageName: string | null;
};

export type PivotEntriesQuery = {
  from: Date;
  to: Date;
  projectId?: string | null;
  folderId?: string | null;
  kind?: "PLAN" | "FACT";
  type?: "INCOME" | "EXPENSE";
  category?: string;
  subcategory?: string | null;
  archived: boolean;
  firmId?: string | null;
  limit?: number;
  offset?: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

export type PivotEntriesResult = {
  entries: PivotEntryDetail[];
  total: number;
  limit: number;
  offset: number;
};

export async function listPivotEntries(
  q: PivotEntriesQuery,
): Promise<PivotEntriesResult> {
  const limit = Math.min(Math.max(q.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(q.offset ?? 0, 0);

  const filters: FinanceListFilters = {
    projectId: q.projectId === "" ? undefined : q.projectId,
    folderId: q.folderId ?? undefined,
    kind: q.kind,
    type: q.type,
    category: q.category,
    from: q.from,
    to: q.to,
    archived: q.archived,
    firmId: q.firmId ?? null,
  };

  // expandFolderFilter handles the folder-descendant + projectless-passthrough
  // edge case the same way the main pivot query does.
  const baseWhere = q.folderId
    ? await expandFolderFilter(filters)
    : buildWhere(filters);

  // Apply subcategory filter explicitly (buildWhere already handles category).
  // null = "no subcategory"; absent = don't filter.
  const where: Prisma.FinanceEntryWhereInput =
    q.subcategory === undefined
      ? baseWhere
      : { AND: [baseWhere, { subcategory: q.subcategory }] };

  const [total, rows] = await Promise.all([
    prisma.financeEntry.count({ where }),
    prisma.financeEntry.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        occurredAt: true,
        title: true,
        description: true,
        amount: true,
        currency: true,
        counterparty: true,
        kind: true,
        type: true,
        source: true,
        status: true,
        estimateItem: {
          select: { unit: true, quantity: true, unitPrice: true },
        },
        foremanReportItem: {
          select: { unit: true, quantity: true, unitPrice: true },
        },
        stageRecord: {
          select: { stage: true },
        },
      },
    }),
  ]);

  const entries: PivotEntryDetail[] = rows.map((r) => {
    // Prefer foreman item (more authoritative for FACT), fall back to estimate.
    const lineSource = r.foremanReportItem ?? r.estimateItem ?? null;
    const unit = lineSource?.unit ?? null;
    const quantity =
      lineSource?.quantity != null ? Number(lineSource.quantity) : null;
    const unitPrice =
      lineSource?.unitPrice != null ? Number(lineSource.unitPrice) : null;

    return {
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      title: r.title,
      description: r.description,
      amount: Number(r.amount),
      currency: r.currency,
      counterparty: r.counterparty,
      kind: r.kind,
      type: r.type,
      source: r.source,
      status: r.status,
      unit,
      quantity,
      unitPrice,
      stageName: r.stageRecord?.stage ?? null,
    };
  });

  return { entries, total, limit, offset };
}
