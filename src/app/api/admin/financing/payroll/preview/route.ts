import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"];

/**
 * GET /api/admin/financing/payroll/preview?year=2026&month=4&mode=cash|taxes
 *
 * Returns active employees + their default monthly salary + whether the
 * relevant payroll entry was already created for this period.
 *
 * Modes:
 *   - cash   — готівка. Records persisted with `subcategory: 'cash'`. Can be
 *              created N times per period (advance + final + overtime…),
 *              so we surface counts and totals instead of an "already-exists"
 *              flag.
 *   - taxes  — податки. Persisted with `subcategory: 'taxes'`. Idempotent —
 *              once per period; existing record is shown so the UI can grey
 *              the row out.
 *
 * Cash records also count toward "previously paid for this period" so the
 * user can see how much of the salary remains to be paid out.
 */
const MODE_VALUES = ["cash", "taxes"] as const;
type Mode = (typeof MODE_VALUES)[number];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(url.searchParams.get("month") ?? new Date().getMonth() + 1);
  const modeRaw = (url.searchParams.get("mode") ?? "cash") as Mode;
  const mode: Mode = MODE_VALUES.includes(modeRaw) ? modeRaw : "cash";

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
      subcategory: true,
    },
  });

  // Group existing entries per employee so we can return both per-mode info
  const cashByName = new Map<string, { count: number; total: number }>();
  const taxByName = new Map<
    string,
    { id: string; amount: number; status: string }
  >();
  for (const e of existing) {
    const name = e.counterparty ?? "";
    if (e.subcategory === "taxes") {
      taxByName.set(name, {
        id: e.id,
        amount: Number(e.amount),
        status: e.status,
      });
    } else {
      // 'cash', null (legacy salary entries), or anything else — treat as cash payout
      const prev = cashByName.get(name) ?? { count: 0, total: 0 };
      prev.count += 1;
      prev.total += Number(e.amount);
      cashByName.set(name, prev);
    }
  }

  return NextResponse.json({
    period: { year, month },
    mode,
    rows: employees.map((e) => {
      const cashPaid = cashByName.get(e.fullName) ?? { count: 0, total: 0 };
      const taxRecord = taxByName.get(e.fullName);
      const baseSalary = e.salaryAmount != null ? Number(e.salaryAmount) : null;
      const remainingCash = baseSalary != null ? Math.max(0, baseSalary - cashPaid.total) : null;
      return {
        id: e.id,
        fullName: e.fullName,
        position: e.position,
        salaryType: e.salaryType,
        amount: baseSalary,
        currency: e.currency,
        cashPaid,
        remainingCash,
        // For 'taxes' mode the dedup behaves like before
        existing: mode === "taxes" && taxRecord ? taxRecord : null,
      };
    }),
  });
}
