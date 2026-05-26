import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  READ_ROLES,
  isAccessResponse,
  requireCounterpartyAccess,
} from "@/lib/counterparties/access";

export const runtime = "nodejs";

/**
 * GET: aggregated історія співпраці з контрагентом. Для кожного проєкту:
 *   - сума invoiced (FACT EXPENSE загалом за цим counterparty)
 *   - сума paid (через SupplierPaymentAllocation)
 *   - кількість fact-entries
 *   - діапазон дат
 *
 * Firm-scope: агрегації обмежені поточною фірмою через resolveFirmScopeForRequest.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: READ_ROLES,
  });
  if (isAccessResponse(access)) return access;

  const { firmId } = await resolveFirmScopeForRequest(access.session);
  const firmFilter = firmId ? { firmId } : {};

  const grouped = await prisma.financeEntry.groupBy({
    by: ["projectId"],
    where: {
      counterpartyId: id,
      isArchived: false,
      type: "EXPENSE",
      kind: "FACT",
      projectId: { not: null },
      ...firmFilter,
    },
    _sum: { amount: true },
    _count: { _all: true },
    _min: { occurredAt: true },
    _max: { occurredAt: true },
  });

  const projectIds = grouped
    .map((g) => g.projectId)
    .filter((id): id is string => Boolean(id));

  const [projects, paidByProject] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, title: true, slug: true, status: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["projectId"],
      where: {
        counterpartyId: id,
        status: "POSTED",
        projectId: { in: projectIds },
        ...firmFilter,
      },
      _sum: { amount: true },
    }),
  ]);

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const paidMap = new Map(
    paidByProject.map((p) => [p.projectId, Number(p._sum.amount ?? 0)]),
  );

  // Кількість reviews по кожному проєкту — допомагає UI показати "вже є відгук"
  // біля кнопки "Написати".
  const reviewCounts = await prisma.counterpartyReview.groupBy({
    by: ["projectId"],
    where: { counterpartyId: id, projectId: { in: projectIds } },
    _count: { _all: true },
  });
  const reviewCountMap = new Map(
    reviewCounts.map((r) => [r.projectId, r._count._all]),
  );

  const items = grouped.map((g) => {
    const project = g.projectId ? projectMap.get(g.projectId) : null;
    const invoiced = Number(g._sum.amount ?? 0);
    const paid = paidMap.get(g.projectId!) ?? 0;
    return {
      projectId: g.projectId,
      project,
      invoiced,
      paid,
      outstanding: Math.max(invoiced - paid, 0),
      entryCount: g._count._all,
      firstAt: g._min.occurredAt,
      lastAt: g._max.occurredAt,
      reviewCount: reviewCountMap.get(g.projectId!) ?? 0,
    };
  });

  items.sort((a, b) => {
    const ad = a.lastAt?.getTime() ?? 0;
    const bd = b.lastAt?.getTime() ?? 0;
    return bd - ad;
  });

  return NextResponse.json({ items });
}
