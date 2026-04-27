import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const itemSchema = z.object({
  employeeId: z.string().min(1),
  amount: z.number().positive(),
});

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  items: z.array(itemSchema).min(1, "Нічого нараховувати"),
  folderId: z.string().optional(),
  occurredAt: z.string().optional(),
  kind: z.enum(["PLAN", "FACT"]).default("PLAN"),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "PAID"]).default("DRAFT"),
});

/**
 * POST /api/admin/financing/payroll/run
 *
 * Bulk-create salary FinanceEntry rows for selected employees over a given
 * (year, month). Idempotent: skips employees who already have a salary
 * entry that fingerprints to the same period.
 *
 * Why a custom endpoint and not the generic template-apply: salary requires
 * a per-employee counterparty + per-employee amount + period-level dedup,
 * which the one-click template flow doesn't model.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof z.ZodError ? err.issues.map((i) => i.message).join("; ") : "Невірне тіло запиту" },
      { status: 400 }
    );
  }

  const { year, month, items, folderId, kind, status } = body;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date(Date.UTC(year, month - 1, 25));
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Некоректна дата" }, { status: 400 });
  }

  const employees = await prisma.employee.findMany({
    where: { id: { in: items.map((i) => i.employeeId) }, isActive: true },
    select: { id: true, fullName: true, currency: true },
  });
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const existing = await prisma.financeEntry.findMany({
    where: {
      type: "EXPENSE",
      category: "salary",
      isArchived: false,
      occurredAt: { gte: periodStart, lt: periodEnd },
      counterparty: { in: employees.map((e) => e.fullName) },
    },
    select: { counterparty: true },
  });
  const alreadyHas = new Set(existing.map((e) => e.counterparty ?? ""));

  const createdIds: string[] = [];
  const skipped: Array<{ employeeId: string; reason: string }> = [];

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const emp = employeeById.get(item.employeeId);
      if (!emp) {
        skipped.push({ employeeId: item.employeeId, reason: "не знайдено або неактивний" });
        continue;
      }
      if (alreadyHas.has(emp.fullName)) {
        skipped.push({ employeeId: item.employeeId, reason: "ЗП за період вже існує" });
        continue;
      }

      const entry = await tx.financeEntry.create({
        data: {
          occurredAt,
          kind,
          type: "EXPENSE",
          source: "MANUAL",
          amount: new Prisma.Decimal(item.amount),
          currency: emp.currency || "UAH",
          projectId: null,
          folderId: folderId ?? null,
          category: "salary",
          title: `ЗП ${emp.fullName} (${month.toString().padStart(2, "0")}.${year})`,
          description: null,
          counterparty: emp.fullName,
          createdById: session.user.id,
          status,
        },
        select: { id: true },
      });
      createdIds.push(entry.id);
    }
  });

  log.info("payroll:run", {
    period: `${year}-${month}`,
    requested: items.length,
    created: createdIds.length,
    skipped: skipped.length,
    userId: session.user.id,
  });

  await auditLog({
    userId: session.user.id,
    action: "CREATE",
    entity: "FinanceEntry",
    entityId: createdIds[0] ?? "payroll-bulk",
    newData: {
      bulkPayroll: true,
      period: { year, month },
      created: createdIds.length,
      skipped: skipped.length,
    },
  });

  return NextResponse.json({
    period: { year, month },
    created: createdIds,
    skipped,
  });
}
