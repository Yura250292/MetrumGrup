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
  note: z.string().optional(),
});

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  /// Required for cash/taxes modes; ignored for timesheet mode.
  items: z.array(itemSchema).optional(),
  folderId: z.string().optional(),
  occurredAt: z.string().optional(),
  kind: z.enum(["PLAN", "FACT"]).default("PLAN"),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "PAID"]).default("DRAFT"),
  mode: z.enum(["cash", "taxes", "timesheet"]).default("cash"),
  /// timesheet mode: optional filter to roll up only one project's timesheets.
  projectId: z.string().optional(),
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

  const { year, month, items, folderId, kind, status, mode, projectId } = body;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  // ===== Timesheet mode: roll up approved timesheets into per-project labor entries.
  if (mode === "timesheet") {
    const monthLabelTs = `${month.toString().padStart(2, "0")}.${year}`;
    const sheets = await prisma.timesheet.findMany({
      where: {
        approvedAt: { not: null },
        financeEntryId: null,
        date: { gte: periodStart, lt: periodEnd },
        ...(projectId ? { projectId } : {}),
      },
      select: {
        id: true,
        amount: true,
        employeeId: true,
        workerId: true,
        projectId: true,
        costCodeId: true,
        costType: true,
        employee: { select: { fullName: true, currency: true, burdenMultiplier: true } },
        worker: { select: { name: true } },
      },
    });

    if (sheets.length === 0) {
      return NextResponse.json(
        {
          period: { year, month },
          mode,
          created: [],
          skipped: [],
          message: "Немає затверджених табелів за період без вже зареєстрованої ЗП",
        },
      );
    }

    // Group by (employee/worker × project × costCode × costType).
    type GroupKey = string;
    const groups = new Map<
      GroupKey,
      {
        sheetIds: string[];
        sum: number;
        projectId: string;
        costCodeId: string | null;
        costType: typeof sheets[number]["costType"];
        counterparty: string;
        currency: string;
        employeeId: string | null;
        workerId: string | null;
      }
    >();
    for (const s of sheets) {
      const burden = s.employee?.burdenMultiplier
        ? Number(s.employee.burdenMultiplier)
        : 1;
      const amt = Number(s.amount) * burden;
      const counterparty = s.employee?.fullName ?? s.worker?.name ?? "?";
      const key = `${s.employeeId ?? "_"}|${s.workerId ?? "_"}|${s.projectId}|${s.costCodeId ?? "_"}|${s.costType ?? "_"}`;
      const g = groups.get(key);
      if (g) {
        g.sheetIds.push(s.id);
        g.sum += amt;
      } else {
        groups.set(key, {
          sheetIds: [s.id],
          sum: amt,
          projectId: s.projectId,
          costCodeId: s.costCodeId,
          costType: s.costType,
          counterparty,
          currency: s.employee?.currency ?? "UAH",
          employeeId: s.employeeId,
          workerId: s.workerId,
        });
      }
    }

    const createdIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const g of groups.values()) {
        const entry = await tx.financeEntry.create({
          data: {
            occurredAt: new Date(Date.UTC(year, month, 0)), // last day of month
            kind,
            type: "EXPENSE",
            source: "MANUAL",
            amount: new Prisma.Decimal(+g.sum.toFixed(2)),
            currency: g.currency,
            projectId: g.projectId,
            folderId: folderId ?? null,
            category: "salary",
            subcategory: "timesheet",
            title: `Робота ${g.counterparty} (${monthLabelTs})`,
            description: `Зведено з ${g.sheetIds.length} табел${g.sheetIds.length === 1 ? "ю" : "ів"}`,
            counterparty: g.counterparty,
            costCodeId: g.costCodeId,
            costType: g.costType ?? "LABOR",
            createdById: session.user.id,
            status,
          },
          select: { id: true },
        });
        await tx.timesheet.updateMany({
          where: { id: { in: g.sheetIds } },
          data: { financeEntryId: entry.id },
        });
        createdIds.push(entry.id);
      }
    });

    log.info("payroll:run", {
      mode,
      period: `${year}-${month}`,
      groups: groups.size,
      sheets: sheets.length,
      created: createdIds.length,
      userId: session.user.id,
    });

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "FinanceEntry",
      entityId: createdIds[0] ?? "payroll-timesheet-bulk",
      newData: {
        bulkPayroll: true,
        mode,
        period: { year, month },
        created: createdIds.length,
        sheets: sheets.length,
      },
    });

    return NextResponse.json({
      period: { year, month },
      mode,
      created: createdIds,
      sheetsRolled: sheets.length,
    });
  }

  // ===== Cash / taxes modes (legacy): explicit per-employee items.
  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "Для cash/taxes режимів потрібен список items" },
      { status: 400 },
    );
  }

  // Default occurredAt: 15-th for cash advance/payouts, last day of month for taxes
  const defaultDay = mode === "taxes" ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 15;
  const occurredAt = body.occurredAt
    ? new Date(body.occurredAt)
    : new Date(Date.UTC(year, month - 1, defaultDay));
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Некоректна дата" }, { status: 400 });
  }

  const employees = await prisma.employee.findMany({
    where: { id: { in: items.map((i) => i.employeeId) }, isActive: true },
    select: { id: true, fullName: true, currency: true },
  });
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  // Idempotency only for taxes — cash can be created multiple times per period
  // (advance + final + overtime adjustments).
  const alreadyHas = new Set<string>();
  if (mode === "taxes") {
    const existing = await prisma.financeEntry.findMany({
      where: {
        type: "EXPENSE",
        category: "salary",
        subcategory: "taxes",
        isArchived: false,
        occurredAt: { gte: periodStart, lt: periodEnd },
        counterparty: { in: employees.map((e) => e.fullName) },
      },
      select: { counterparty: true },
    });
    for (const e of existing) alreadyHas.add(e.counterparty ?? "");
  }

  const createdIds: string[] = [];
  const skipped: Array<{ employeeId: string; reason: string }> = [];
  const monthLabel = `${month.toString().padStart(2, "0")}.${year}`;

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const emp = employeeById.get(item.employeeId);
      if (!emp) {
        skipped.push({ employeeId: item.employeeId, reason: "не знайдено або неактивний" });
        continue;
      }
      if (alreadyHas.has(emp.fullName)) {
        skipped.push({ employeeId: item.employeeId, reason: "Податки за період вже нараховано" });
        continue;
      }

      const titlePrefix =
        mode === "taxes"
          ? "Податки ЗП"
          : item.note?.trim()
            ? `ЗП (${item.note.trim()})`
            : "ЗП готівка";

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
          subcategory: mode === "taxes" ? "taxes" : "cash",
          title: `${titlePrefix} ${emp.fullName} (${monthLabel})`,
          description: item.note?.trim() ? item.note.trim() : null,
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
    mode,
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
      mode,
      period: { year, month },
      created: createdIds.length,
      skipped: skipped.length,
    },
  });

  return NextResponse.json({
    period: { year, month },
    mode,
    created: createdIds,
    skipped,
  });
}
