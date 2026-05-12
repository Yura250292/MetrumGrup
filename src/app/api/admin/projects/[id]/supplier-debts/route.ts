import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor, assertCanAccessFirm } from "@/lib/firm/scope";

export const runtime = "nodejs";

const ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Phase 4: agregація боргу за постачальниками для конкретного проєкту.
 * Використовується віджетом "Борги перед постачальниками" на картці проєкту.
 *
 * Відповідь:
 *   debts: [{
 *     counterpartyId, counterpartyName, outstanding,
 *     entries: [{ id, occurredAt, title, amount, paidAmount, outstanding }],
 *     materials: [{ name, qty, amount }]   // breakdown по title для UI collapsible
 *   }]
 *   totalOutstanding: sum of all
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  assertCanAccessFirm(session, project.firmId);

  // Несплачені факти цього проєкту, привʼязані до постачальника.
  // Safe Finance Migration Phase 4.1: основний фільтр — financeNature=
  // COMMITTED_EXPENSE. Для legacy записів (null до Phase 3 backfill) лишаємо
  // fallback через kind=FACT, status APPROVED|PENDING — щоб не зникли борги
  // на період міграції. Після повного backfill цей fallback можна прибрати.
  // Phase 6 хардгард: explicit ACTUAL_* виключаємо навіть якщо status підходить.
  const unpaid = await prisma.financeEntry.findMany({
    where: {
      projectId,
      type: "EXPENSE",
      kind: "FACT",
      isArchived: false,
      status: { in: ["APPROVED", "PENDING"] },
      counterpartyId: { not: null },
      NOT: { financeNature: { in: ["ACTUAL_EXPENSE", "ACTUAL_INCOME"] } },
      OR: [
        { financeNature: "COMMITTED_EXPENSE" },
        { financeNature: null },
      ],
      ...(firmId ? { firmId } : {}),
    },
    select: {
      id: true,
      occurredAt: true,
      title: true,
      amount: true,
      counterpartyId: true,
      counterpartyEntity: { select: { id: true, name: true } },
    },
  });

  if (unpaid.length === 0) {
    return NextResponse.json({ data: { debts: [], totalOutstanding: 0 } });
  }

  // Allocations groupBy для розрахунку outstanding на FE.
  const allocs = await prisma.supplierPaymentAllocation.groupBy({
    by: ["financeEntryId"],
    where: { financeEntryId: { in: unpaid.map((e) => e.id) } },
    _sum: { amount: true },
  });
  const allocByEntry = new Map<string, number>();
  for (const a of allocs) {
    allocByEntry.set(a.financeEntryId, Number(a._sum.amount ?? 0));
  }

  type EntryRow = {
    id: string;
    occurredAt: string;
    title: string;
    amount: number;
    paidAmount: number;
    outstanding: number;
  };
  type Debt = {
    counterpartyId: string;
    counterpartyName: string;
    outstanding: number;
    entries: EntryRow[];
    materials: Array<{ name: string; count: number; outstanding: number }>;
  };

  const byCp = new Map<string, Debt>();
  let totalOutstanding = 0;

  for (const e of unpaid) {
    if (!e.counterpartyId) continue;
    const amount = Number(e.amount);
    const paid = allocByEntry.get(e.id) ?? 0;
    const outstanding = amount - paid;
    if (outstanding <= 0) continue;
    totalOutstanding += outstanding;

    const cur = byCp.get(e.counterpartyId) ?? {
      counterpartyId: e.counterpartyId,
      counterpartyName: e.counterpartyEntity?.name ?? "Постачальник",
      outstanding: 0,
      entries: [],
      materials: [],
    };
    cur.outstanding += outstanding;
    cur.entries.push({
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      title: e.title,
      amount,
      paidAmount: paid,
      outstanding,
    });
    byCp.set(e.counterpartyId, cur);
  }

  // Materials breakdown — groupBy title в межах кожного counterparty.
  for (const debt of byCp.values()) {
    const matMap = new Map<string, { name: string; count: number; outstanding: number }>();
    for (const e of debt.entries) {
      const key = e.title.trim().toLowerCase().replace(/\s+/g, " ") || "—";
      const cur = matMap.get(key) ?? { name: e.title || "—", count: 0, outstanding: 0 };
      cur.count += 1;
      cur.outstanding += e.outstanding;
      matMap.set(key, cur);
    }
    debt.materials = Array.from(matMap.values()).sort(
      (a, b) => b.outstanding - a.outstanding,
    );
    debt.entries.sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
  }

  const debts = Array.from(byCp.values()).sort((a, b) => b.outstanding - a.outstanding);

  return NextResponse.json({
    data: { debts, totalOutstanding },
  });
}
