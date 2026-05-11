import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { canAccessCounterparty } from "@/lib/firm/counterparty-scope";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

/**
 * Список рахунків (FinanceEntry FACT/EXPENSE) одного постачальника з
 * outstanding-розрахунком на рівень рахунку. Для drill-down у Ledger.
 *
 * Сортує: спочатку DEBT (борг), за occurredAt DESC; потім PAID за paidAt DESC.
 * Це відповідає правилу "кредиторів вверх" на рівні рядків постачальника.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const cp = await prisma.counterparty.findUnique({
    where: { id },
    select: { id: true, firmId: true },
  });
  if (!cp) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !READ_ROLES.includes(role)) return forbiddenResponse();
  if (
    !canAccessCounterparty({
      userFirmId: session.user.firmId ?? null,
      userIsSuperAdmin: session.user.role === "SUPER_ADMIN",
      counterpartyFirmId: cp.firmId,
    })
  ) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status"); // "debt" | "paid" | "all" (default all)
  const take = Math.min(
    Number(url.searchParams.get("take") ?? "100") || 100,
    500,
  );
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) dateFilter.gte = d;
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }
  }

  const statusFilter =
    status === "debt"
      ? { in: ["APPROVED", "PENDING"] as ("APPROVED" | "PENDING")[] }
      : status === "paid"
        ? { equals: "PAID" as const }
        : undefined;

  const entries = await prisma.financeEntry.findMany({
    where: {
      counterpartyId: id,
      type: "EXPENSE",
      kind: "FACT",
      isArchived: false,
      ...(firmId ? { firmId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(dateFilter.gte || dateFilter.lte ? { occurredAt: dateFilter } : {}),
    },
    select: {
      id: true,
      occurredAt: true,
      title: true,
      description: true,
      invoiceNumber: true,
      amount: true,
      status: true,
      paidAt: true,
      remindAt: true,
      firmId: true,
      project: { select: { id: true, title: true, slug: true } },
      allocations: { select: { amount: true } },
    },
    orderBy: { occurredAt: "desc" },
    take,
  });

  const shaped = entries.map((e) => {
    const allocated = e.allocations.reduce((s, a) => s + Number(a.amount), 0);
    const total = Number(e.amount);
    const outstanding = Math.max(0, total - allocated);
    return {
      id: e.id,
      occurredAt: e.occurredAt,
      title: e.title,
      description: e.description,
      invoiceNumber: e.invoiceNumber,
      amount: total,
      paidAmount: allocated,
      outstanding,
      status: e.status,
      paidAt: e.paidAt,
      remindAt: e.remindAt,
      firmId: e.firmId,
      project: e.project,
    };
  });

  // Сортуємо: спочатку всі з outstanding>0 (борги), за occurredAt DESC;
  // потім оплачені за paidAt DESC.
  shaped.sort((a, b) => {
    const aDebt = a.outstanding > 0 ? 1 : 0;
    const bDebt = b.outstanding > 0 ? 1 : 0;
    if (aDebt !== bDebt) return bDebt - aDebt;
    if (aDebt === 1) {
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    }
    const ap = a.paidAt ? new Date(a.paidAt).getTime() : 0;
    const bp = b.paidAt ? new Date(b.paidAt).getTime() : 0;
    return bp - ap;
  });

  return NextResponse.json({ data: shaped });
}
