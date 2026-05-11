import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  firmIdForNewEntity,
  DEFAULT_FIRM_ID,
} from "@/lib/firm/scope";
import { counterpartyFirmWhere } from "@/lib/firm/counterparty-scope";

export const runtime = "nodejs";

// Finance-scoped read access — also picks up engineers for read-only.
const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];
// Autocreate is restricted to staff who actively log finance ops.
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"];

const querySchema = z.object({
  q: z.string().trim().optional(),
  type: z.enum(["LEGAL", "INDIVIDUAL", "FOP"]).optional(),
  role: z.enum(["CLIENT", "SUPPLIER", "CONTRACTOR", "EMPLOYEE", "OTHER"]).optional(),
  /// Якщо true — повернути ТІЛЬКИ постачальників з outstanding > 0.
  hasDebt: z.coerce.boolean().default(false),
  /// Якщо true — додає поле `outstanding` (sum unpaid expenses) у відповідь.
  /// hasDebt автоматично активує цей розрахунок.
  withOutstanding: z.coerce.boolean().default(false),
  /// Якщо true — додає розширену статистику: totalInvoiced, totalPaid,
  /// invoiceCount, paidCount, debtCount, firstInvoiceDate, lastInvoiceDate,
  /// lastPaymentDate. Дорожче за withOutstanding (3 групувальні запити),
  /// тому окремий прапор.
  withStats: z.coerce.boolean().default(false),
  /// Фільтр по даті останнього рахунку (occurredAt). Поза діапазоном —
  /// постачальник усе одно повертається, але без активності за період.
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  includeInactive: z.coerce.boolean().default(false),
  take: z.coerce.number().int().positive().max(500).default(50),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Назва обовʼязкова"),
  type: z.enum(["LEGAL", "INDIVIDUAL", "FOP"]).default("LEGAL"),
  edrpou: z.string().trim().optional().nullable(),
  iban: z.string().trim().optional().nullable(),
  vatPayer: z.boolean().default(false),
  taxId: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  address: z.string().trim().optional().nullable(),
});

function normaliseName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні параметри", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    q,
    type,
    role,
    hasDebt,
    withOutstanding,
    withStats,
    dateFrom,
    dateTo,
    includeInactive,
    take,
  } = parsed.data;

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) dateFilter.gte = d;
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) {
      // include the whole day
      d.setHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }
  }
  const hasDateFilter = dateFilter.gte || dateFilter.lte;

  // Counterparty filter: firmId=null records (shared SUPPLIERS) are visible
  // to both Group і Studio. Інші ролі лишаються firm-ізольовані.
  const firmScope = counterpartyFirmWhere(firmId);

  const items = await prisma.counterparty.findMany({
    where: {
      AND: [
        firmScope,
        includeInactive ? {} : { isActive: true },
        type ? { type } : {},
        role ? { roles: { has: role } } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { edrpou: { contains: q, mode: "insensitive" } },
                { taxId: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take,
  });

  // outstanding agregation. hasDebt автоматично активує розрахунок.
  if (!withOutstanding && !hasDebt && !withStats) {
    return NextResponse.json({ data: items });
  }

  const ids = items.map((c) => c.id);
  if (ids.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Усі факти EXPENSE цих постачальників — основа для outstanding + stats.
  const allFactsWhere = {
    counterpartyId: { in: ids },
    type: "EXPENSE" as const,
    kind: "FACT" as const,
    isArchived: false,
    ...(firmId ? { firmId } : {}),
    ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
  };

  const unpaidEntries = await prisma.financeEntry.findMany({
    where: { ...allFactsWhere, status: { in: ["APPROVED", "PENDING"] } },
    select: {
      id: true,
      counterpartyId: true,
      amount: true,
      occurredAt: true,
    },
  });

  const allocByEntry = new Map<string, number>();
  if (unpaidEntries.length > 0) {
    const allocs = await prisma.supplierPaymentAllocation.groupBy({
      by: ["financeEntryId"],
      where: { financeEntryId: { in: unpaidEntries.map((e) => e.id) } },
      _sum: { amount: true },
    });
    for (const a of allocs) {
      allocByEntry.set(a.financeEntryId, Number(a._sum.amount ?? 0));
    }
  }

  const outstandingByCp = new Map<string, number>();
  const oldestDebtDateByCp = new Map<string, Date>();
  for (const e of unpaidEntries) {
    if (!e.counterpartyId) continue;
    const left = Number(e.amount) - (allocByEntry.get(e.id) ?? 0);
    if (left <= 0) continue;
    outstandingByCp.set(
      e.counterpartyId,
      (outstandingByCp.get(e.counterpartyId) ?? 0) + left,
    );
    const prev = oldestDebtDateByCp.get(e.counterpartyId);
    if (!prev || e.occurredAt < prev) {
      oldestDebtDateByCp.set(e.counterpartyId, e.occurredAt);
    }
  }

  // Stats: total invoiced, paid sum, count by status, first/last dates,
  // last payment date.
  type Stats = {
    invoiceCount: number;
    paidCount: number;
    debtCount: number;
    totalInvoiced: number;
    totalPaid: number;
    firstInvoiceDate: Date | null;
    lastInvoiceDate: Date | null;
    lastPaymentDate: Date | null;
  };
  const statsByCp = new Map<string, Stats>();

  if (withStats) {
    // groupBy для invoice count + sum по статусу.
    const grouped = await prisma.financeEntry.groupBy({
      by: ["counterpartyId", "status"],
      where: allFactsWhere,
      _sum: { amount: true },
      _count: { _all: true },
    });
    for (const g of grouped) {
      if (!g.counterpartyId) continue;
      const s = statsByCp.get(g.counterpartyId) ?? {
        invoiceCount: 0,
        paidCount: 0,
        debtCount: 0,
        totalInvoiced: 0,
        totalPaid: 0,
        firstInvoiceDate: null,
        lastInvoiceDate: null,
        lastPaymentDate: null,
      };
      const cnt = g._count._all;
      const sum = Number(g._sum.amount ?? 0);
      s.invoiceCount += cnt;
      s.totalInvoiced += sum;
      if (g.status === "PAID") {
        s.paidCount += cnt;
        s.totalPaid += sum;
      } else if (g.status === "APPROVED" || g.status === "PENDING") {
        s.debtCount += cnt;
      }
      statsByCp.set(g.counterpartyId, s);
    }

    // min/max occurredAt per counterparty.
    const datesAgg = await prisma.financeEntry.groupBy({
      by: ["counterpartyId"],
      where: allFactsWhere,
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    });
    for (const d of datesAgg) {
      if (!d.counterpartyId) continue;
      const s = statsByCp.get(d.counterpartyId);
      if (!s) continue;
      s.firstInvoiceDate = d._min.occurredAt;
      s.lastInvoiceDate = d._max.occurredAt;
    }

    // Last payment date per counterparty.
    const lastPay = await prisma.supplierPayment.groupBy({
      by: ["counterpartyId"],
      where: {
        counterpartyId: { in: ids },
        status: "POSTED",
        ...(firmId ? { firmId } : {}),
      },
      _max: { occurredAt: true },
    });
    for (const lp of lastPay) {
      const s = statsByCp.get(lp.counterpartyId) ?? null;
      if (!s) continue;
      s.lastPaymentDate = lp._max.occurredAt;
    }
  }

  let result = items.map((c) => {
    const s = statsByCp.get(c.id);
    const outstanding = outstandingByCp.get(c.id) ?? 0;
    return {
      ...c,
      outstanding,
      oldestDebtDate: oldestDebtDateByCp.get(c.id) ?? null,
      ...(withStats
        ? {
            invoiceCount: s?.invoiceCount ?? 0,
            paidCount: s?.paidCount ?? 0,
            debtCount: s?.debtCount ?? 0,
            totalInvoiced: s?.totalInvoiced ?? 0,
            totalPaid: s?.totalPaid ?? 0,
            firstInvoiceDate: s?.firstInvoiceDate ?? null,
            lastInvoiceDate: s?.lastInvoiceDate ?? null,
            lastPaymentDate: s?.lastPaymentDate ?? null,
          }
        : {}),
    };
  });
  if (hasDebt) {
    result = result.filter((c) => c.outstanding > 0);
  }

  return NextResponse.json({ data: result });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const name = normaliseName(data.name);
  const entryFirmId = firmId ?? firmIdForNewEntity(session, DEFAULT_FIRM_ID);

  // Idempotent autocreate — case-insensitive lookup. SUPPLIER (firmId=null)
  // спільні між фірмами, тому шукаємо і shared, і власні-фірмові записи.
  const existing = await prisma.counterparty.findFirst({
    where: {
      AND: [
        { name: { equals: name, mode: "insensitive" } },
        counterpartyFirmWhere(entryFirmId),
      ],
    },
    orderBy: { isActive: "desc" },
  });
  if (existing) {
    return NextResponse.json({ data: existing }, { status: 200 });
  }

  const created = await prisma.counterparty.create({
    data: {
      name,
      type: data.type,
      edrpou: data.edrpou ?? null,
      iban: data.iban ?? null,
      vatPayer: data.vatPayer,
      taxId: data.taxId ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      isActive: true,
      firmId: entryFirmId,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
