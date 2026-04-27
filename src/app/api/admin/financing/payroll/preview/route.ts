import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"];

/**
 * GET /api/admin/financing/payroll/preview?year=2026&month=4
 *
 * Returns active employees + their default monthly salary + whether a salary
 * entry was already created for the requested period (so the UI can grey
 * those rows out and the bulk-run is idempotent).
 *
 * Period match is "salary entry in `salary` category, occurredAt within the
 * month, counterparty equal to fullName" — same fingerprint the bulk-run
 * uses to skip duplicates. If your team starts using `employeeId` as a
 * structured FK on FinanceEntry, switch this lookup to that and remove the
 * counterparty heuristic.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(url.searchParams.get("month") ?? new Date().getMonth() + 1);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Невірний рік" }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Невірний місяць" }, { status: 400 });
  }

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: [{ fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      position: true,
      salaryType: true,
      salaryAmount: true,
      currency: true,
    },
  });

  const fullNames = employees.map((e) => e.fullName);
  const existing = await prisma.financeEntry.findMany({
    where: {
      type: "EXPENSE",
      category: "salary",
      isArchived: false,
      occurredAt: { gte: periodStart, lt: periodEnd },
      counterparty: { in: fullNames },
    },
    select: {
      id: true,
      counterparty: true,
      amount: true,
      status: true,
    },
  });

  const existingByName = new Map(existing.map((e) => [e.counterparty ?? "", e]));

  return NextResponse.json({
    period: { year, month },
    rows: employees.map((e) => {
      const already = existingByName.get(e.fullName);
      return {
        id: e.id,
        fullName: e.fullName,
        position: e.position,
        salaryType: e.salaryType,
        amount: e.salaryAmount != null ? Number(e.salaryAmount) : null,
        currency: e.currency,
        existing: already
          ? { id: already.id, amount: Number(already.amount), status: already.status }
          : null,
      };
    }),
  });
}
