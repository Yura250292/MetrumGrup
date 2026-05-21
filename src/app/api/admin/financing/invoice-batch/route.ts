import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  forbiddenResponse,
  unauthorizedResponse,
  SUPPLIER_LEDGER_ROLES,
} from "@/lib/auth-utils";
import {
  assertCanAccessFirm,
  firmIdForNewEntity,
  DEFAULT_FIRM_ID,
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { validateProjectForFinanceWrite } from "@/lib/financing/project-invariants";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import type { CostType, FinanceEntryStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COST_TYPES = ["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"] as const;
const STATUSES = ["DRAFT", "PENDING", "APPROVED", "PAID"] as const;

const ItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  amount: z.number().positive(),
  category: z.string().min(1),
  costType: z.enum(COST_TYPES).optional().nullable(),
  unit: z.string().max(32).optional().nullable(),
  quantity: z.number().positive().optional().nullable(),
  unitPrice: z.number().positive().optional().nullable(),
});

const Body = z.object({
  counterpartyId: z.string().min(1),
  projectId: z.string().nullable().optional(),
  invoiceNumber: z.string().max(64).nullable().optional(),
  occurredAt: z.string().min(1),
  currency: z.string().default("UAH"),
  status: z.enum(STATUSES).default("APPROVED"),
  items: z.array(ItemSchema).min(1).max(100),
});

/**
 * Batch створення FinanceEntry для однієї накладної: N позицій → N окремих
 * FinanceEntry з спільним invoiceNumber/counterpartyId/projectId. Транзакційно,
 * щоб не лишилось half-imported накладної при помилці однієї позиції.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, activeFirmId)) return forbiddenResponse();
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !SUPPLIER_LEDGER_ROLES.includes(role)) return forbiddenResponse();

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const occurredAt = new Date(data.occurredAt);
  if (isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Невалідна дата" }, { status: 400 });
  }

  // Validate all categories.
  for (const it of data.items) {
    if (!FINANCE_CATEGORY_LABELS[it.category]) {
      return NextResponse.json(
        { error: `Невалідна категорія: ${it.category}` },
        { status: 400 },
      );
    }
  }

  // Resolve project firmId, якщо передано.
  let projectFirmId: string | null = null;
  let projectId: string | null = null;
  if (data.projectId) {
    projectId = data.projectId;
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      select: { firmId: true, isTestProject: true },
    });
    const check = validateProjectForFinanceWrite(proj);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    projectFirmId = check.firmId;
    try {
      assertCanAccessFirm(session, projectFirmId);
    } catch {
      return forbiddenResponse();
    }
  }

  // Resolve counterparty + firmId check.
  const cp = await prisma.counterparty.findUnique({
    where: { id: data.counterpartyId },
    select: { id: true, name: true, firmId: true },
  });
  if (!cp) {
    return NextResponse.json({ error: "Постачальник не існує" }, { status: 400 });
  }
  const entryFirmId =
    projectFirmId ??
    activeFirmId ??
    firmIdForNewEntity(session, DEFAULT_FIRM_ID);
  if (cp.firmId && entryFirmId && cp.firmId !== entryFirmId) {
    return NextResponse.json(
      { error: "Постачальник іншої фірми" },
      { status: 400 },
    );
  }

  const status = data.status as FinanceEntryStatus;
  const invoiceNumber = data.invoiceNumber?.trim() || null;
  const currency = data.currency || "UAH";

  // Транзакція: усі items або жодного.
  const createdIds = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const it of data.items) {
      const entry = await tx.financeEntry.create({
        data: {
          type: "EXPENSE",
          kind: "FACT",
          amount: it.amount,
          currency,
          occurredAt,
          projectId,
          firmId: entryFirmId,
          category: it.category,
          title: it.title,
          description: it.description ?? null,
          counterparty: cp.name,
          counterpartyId: cp.id,
          costType: (it.costType ?? null) as CostType | null,
          createdById: session.user.id,
          status,
          paidAt: status === "PAID" ? occurredAt : null,
          source: "MANUAL",
          invoiceNumber,
        },
        select: { id: true },
      });
      ids.push(entry.id);
    }
    return ids;
  });

  return NextResponse.json({
    ok: true,
    createdCount: createdIds.length,
    ids: createdIds,
  });
}
