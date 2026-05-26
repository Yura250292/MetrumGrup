import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession, isHomeFirmFor } from "@/lib/firm/scope";
import { canAccessCounterparty } from "@/lib/firm/counterparty-scope";

export const runtime = "nodejs";

const READ_ROLES: Role[] = [
  "SUPER_ADMIN",
  "MANAGER",
  "FINANCIER",
  "ENGINEER",
  "HR",
];

const MAX_COMPARE = 3;

/**
 * GET /api/admin/financing/counterparties/compare?ids=a,b[,c]
 *
 * Повертає side-by-side дані для до 3 контрагентів: базові поля, SRM
 * метрики, агрегати (totalInvoiced, totalPaid) скоуповані по поточній фірмі.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (!activeRole || !READ_ROLES.includes(activeRole)) {
    return forbiddenResponse();
  }

  const idsParam = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length < 2 || ids.length > MAX_COMPARE) {
    return NextResponse.json(
      { error: `Потрібно від 2 до ${MAX_COMPARE} контрагентів` },
      { status: 400 },
    );
  }

  const counterparties = await prisma.counterparty.findMany({
    where: { id: { in: ids } },
  });

  // Hide entities the user can't access (silent drop to avoid leakage).
  const accessible = counterparties.filter((cp) =>
    canAccessCounterparty({
      userFirmId: session.user.firmId ?? null,
      userIsSuperAdmin: session.user.role === "SUPER_ADMIN",
      counterpartyFirmId: cp.firmId,
    }),
  );
  if (accessible.length < 2) {
    return NextResponse.json(
      { error: "Недостатньо доступних контрагентів для порівняння" },
      { status: 404 },
    );
  }

  const firmFilter = firmId ? { firmId } : {};
  const accessibleIds = accessible.map((c) => c.id);

  const [invoicedAgg, paidAgg, documentCounts] = await Promise.all([
    prisma.financeEntry.groupBy({
      by: ["counterpartyId"],
      where: {
        counterpartyId: { in: accessibleIds },
        type: "EXPENSE",
        kind: "FACT",
        isArchived: false,
        ...firmFilter,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["counterpartyId"],
      where: {
        counterpartyId: { in: accessibleIds },
        status: "POSTED",
        ...firmFilter,
      },
      _sum: { amount: true },
    }),
    prisma.counterpartyDocument.groupBy({
      by: ["counterpartyId"],
      where: { counterpartyId: { in: accessibleIds }, isActive: true },
      _count: { _all: true },
    }),
  ]);

  const invoicedMap = new Map(
    invoicedAgg.map((g) => [
      g.counterpartyId!,
      { sum: Number(g._sum.amount ?? 0), count: g._count._all },
    ]),
  );
  const paidMap = new Map(
    paidAgg.map((g) => [g.counterpartyId, Number(g._sum.amount ?? 0)]),
  );
  const docMap = new Map(
    documentCounts.map((g) => [g.counterpartyId, g._count._all]),
  );

  const items = accessible.map((cp) => {
    const inv = invoicedMap.get(cp.id);
    return {
      id: cp.id,
      name: cp.name,
      type: cp.type,
      roles: cp.roles,
      edrpou: cp.edrpou,
      legalForm: cp.legalForm,
      taxStatus: cp.taxStatus,
      taxStatusCheckedAt: cp.taxStatusCheckedAt,
      avgRating: cp.avgRating ? Number(cp.avgRating) : null,
      totalReviews: cp.totalReviews,
      totalProjects: cp.totalProjects,
      specializations: cp.specializations,
      licenseNumber: cp.licenseNumber,
      licenseValidUntil: cp.licenseValidUntil,
      defaultPaymentTermsDays: cp.defaultPaymentTermsDays,
      preferredPaymentMethod: cp.preferredPaymentMethod,
      totalInvoiced: inv?.sum ?? 0,
      invoiceCount: inv?.count ?? 0,
      totalPaid: paidMap.get(cp.id) ?? 0,
      documentCount: docMap.get(cp.id) ?? 0,
    };
  });

  return NextResponse.json({ items });
}
