import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor, getActiveRoleFromSession } from "@/lib/firm/scope";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"];
const DELETE_ROLES: Role[] = ["SUPER_ADMIN"];

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(["LEGAL", "INDIVIDUAL", "FOP"]).optional(),
  edrpou: z.string().trim().nullable().optional(),
  iban: z.string().trim().nullable().optional(),
  vatPayer: z.boolean().optional(),
  taxId: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const cp = await prisma.counterparty.findUnique({ where: { id } });
  if (!cp) return NextResponse.json({ error: "Контрагента не знайдено" }, { status: 404 });

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (!activeRole || !READ_ROLES.includes(activeRole)) return forbiddenResponse();
  const firmFilter: { firmId?: string } = firmId ? { firmId } : {};

  // Aggregate per kind/type/status to build the KPI strip on the dossier page.
  // Scoped by firm: studio director sees only Metrum Studio totals for shared counterparties.
  const grouped = await prisma.financeEntry.groupBy({
    by: ["kind", "type", "status"],
    where: { counterpartyId: id, isArchived: false, ...firmFilter },
    _sum: { amount: true },
    _count: { _all: true },
  });

  let totalIn = 0;
  let totalOut = 0;
  let paidIn = 0;
  let paidOut = 0;
  let pendingOut = 0;
  let pendingIn = 0;
  let count = 0;
  for (const g of grouped) {
    const v = Number(g._sum.amount ?? 0);
    count += g._count._all;
    if (g.type === "INCOME") {
      totalIn += v;
      if (g.status === "PAID") paidIn += v;
      else if (g.status === "APPROVED" || g.status === "PENDING") pendingIn += v;
    } else {
      totalOut += v;
      if (g.status === "PAID") paidOut += v;
      else if (g.status === "APPROVED" || g.status === "PENDING") pendingOut += v;
    }
  }
  // Balance: positive = we owe them, negative = they owe us.
  // For an expense counterparty (subcontractor): unpaid expenses = outstanding to pay.
  const balance = pendingOut - pendingIn;

  // Active commitments / contracts placeholder — none yet (Phase 2).
  // For now, use most-recent project list this counterparty appears on.
  const recentProjects = await prisma.financeEntry.findMany({
    where: {
      counterpartyId: id,
      isArchived: false,
      projectId: { not: null },
      ...firmFilter,
    },
    select: {
      projectId: true,
      project: { select: { id: true, title: true, slug: true } },
    },
    distinct: ["projectId"],
    orderBy: { occurredAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    data: cp,
    stats: {
      count,
      totalIncoming: totalIn,
      totalOutgoing: totalOut,
      paidIncoming: paidIn,
      paidOutgoing: paidOut,
      pendingIncoming: pendingIn,
      pendingOutgoing: pendingOut,
      balance,
    },
    projects: recentProjects.map((r) => r.project).filter(Boolean),
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const existing = await prisma.counterparty.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await prisma.counterparty.update({
    where: { id },
    data: parsed.data,
  });

  // Refresh denormalised name on FinanceEntry / FinanceExpenseTemplate when renamed.
  if (parsed.data.name && parsed.data.name !== existing.name) {
    await prisma.$transaction([
      prisma.financeEntry.updateMany({
        where: { counterpartyId: id },
        data: { counterparty: parsed.data.name },
      }),
      prisma.financeExpenseTemplate.updateMany({
        where: { counterpartyId: id },
        data: { counterparty: parsed.data.name },
      }),
    ]);
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!DELETE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const existing = await prisma.counterparty.findUnique({
    where: { id },
    select: { id: true, _count: { select: { financeEntries: true, financeTemplates: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  if (existing._count.financeEntries > 0 || existing._count.financeTemplates > 0) {
    // Soft-delete instead — don't break audit trail.
    await prisma.counterparty.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true, soft: true });
  }

  await prisma.counterparty.delete({ where: { id } });
  return NextResponse.json({ ok: true, soft: false });
}
