import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor } from "@/lib/firm/scope";

export const runtime = "nodejs";

const ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

const querySchema = z.object({
  /// CSV списку id проєктів. Підтримується GET-формат для легкого кешування.
  ids: z.string().min(1),
});

/**
 * Phase 4 (supplier-debt): batch-агрегація боргу постачальникам для списку
 * проєктів. UI таблиці викликає цей endpoint один раз для всіх видимих
 * проєктів — без N+1 queries.
 *
 * Відповідь: { [projectId]: { outstanding, supplierCount } }
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні параметри" },
      { status: 400 },
    );
  }
  const ids = parsed.data.ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500);
  if (ids.length === 0) {
    return NextResponse.json({ data: {} });
  }

  // Несплачені факти цих проєктів з прив'язкою до постачальника.
  const unpaid = await prisma.financeEntry.findMany({
    where: {
      projectId: { in: ids },
      type: "EXPENSE",
      kind: "FACT",
      isArchived: false,
      status: { in: ["APPROVED", "PENDING"] },
      counterpartyId: { not: null },
      ...(firmId ? { firmId } : {}),
    },
    select: {
      id: true,
      amount: true,
      projectId: true,
      counterpartyId: true,
    },
  });

  if (unpaid.length === 0) {
    return NextResponse.json({ data: {} });
  }

  const allocs = await prisma.supplierPaymentAllocation.groupBy({
    by: ["financeEntryId"],
    where: { financeEntryId: { in: unpaid.map((e) => e.id) } },
    _sum: { amount: true },
  });
  const allocByEntry = new Map<string, number>();
  for (const a of allocs) {
    allocByEntry.set(a.financeEntryId, Number(a._sum.amount ?? 0));
  }

  type Acc = { outstanding: number; suppliers: Set<string> };
  const byProject = new Map<string, Acc>();
  for (const e of unpaid) {
    if (!e.projectId || !e.counterpartyId) continue;
    const left = Number(e.amount) - (allocByEntry.get(e.id) ?? 0);
    if (left <= 0) continue;
    const cur = byProject.get(e.projectId) ?? {
      outstanding: 0,
      suppliers: new Set<string>(),
    };
    cur.outstanding += left;
    cur.suppliers.add(e.counterpartyId);
    byProject.set(e.projectId, cur);
  }

  const data: Record<string, { outstanding: number; supplierCount: number }> = {};
  for (const [projectId, acc] of byProject) {
    data[projectId] = {
      outstanding: acc.outstanding,
      supplierCount: acc.suppliers.size,
    };
  }

  return NextResponse.json({ data });
}
