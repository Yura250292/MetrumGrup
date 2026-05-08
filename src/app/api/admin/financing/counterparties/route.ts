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

  const { q, type, role, hasDebt, withOutstanding, includeInactive, take } = parsed.data;

  const items = await prisma.counterparty.findMany({
    where: {
      ...(firmId ? { firmId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
      ...(type ? { type } : {}),
      ...(role ? { roles: { has: role } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { edrpou: { contains: q, mode: "insensitive" } },
              { taxId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take,
  });

  // outstanding agregation. hasDebt автоматично активує розрахунок (інакше нема як фільтрувати).
  if (!withOutstanding && !hasDebt) {
    return NextResponse.json({ data: items });
  }

  const ids = items.map((c) => c.id);
  if (ids.length === 0) {
    return NextResponse.json({ data: items.map((c) => ({ ...c, outstanding: 0 })) });
  }

  // Несплачені факти цих контрагентів (FACT/EXPENSE/APPROVED|PENDING).
  const unpaidEntries = await prisma.financeEntry.findMany({
    where: {
      counterpartyId: { in: ids },
      type: "EXPENSE",
      kind: "FACT",
      isArchived: false,
      status: { in: ["APPROVED", "PENDING"] },
      ...(firmId ? { firmId } : {}),
    },
    select: { id: true, counterpartyId: true, amount: true },
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
  for (const e of unpaidEntries) {
    if (!e.counterpartyId) continue;
    const left = Number(e.amount) - (allocByEntry.get(e.id) ?? 0);
    if (left <= 0) continue;
    outstandingByCp.set(
      e.counterpartyId,
      (outstandingByCp.get(e.counterpartyId) ?? 0) + left,
    );
  }

  let result = items.map((c) => ({
    ...c,
    outstanding: outstandingByCp.get(c.id) ?? 0,
  }));
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

  // Idempotent autocreate — case-insensitive lookup, scoped to active firm
  // (один SUPPLIER може існувати окремо в Group та Studio).
  const existing = await prisma.counterparty.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(entryFirmId ? { firmId: entryFirmId } : {}),
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
