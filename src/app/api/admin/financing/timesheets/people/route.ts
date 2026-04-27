import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

/**
 * Roster for the timesheet week-grid: active employees + workers, lightweight
 * payload for combobox / dropdown rendering. Accessible to financing roles
 * (HR endpoints in /admin/hr require HR/MANAGER, which is too narrow here).
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const [employees, workers] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: [{ fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        position: true,
        salaryType: true,
        salaryAmount: true,
      },
    }),
    prisma.worker.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        specialty: true,
        rateAmount: true,
        dailyRate: true,
        rateType: true,
      },
    }),
  ]);

  return NextResponse.json({
    employees: employees.map((e) => ({
      id: e.id,
      name: e.fullName,
      role: e.position ?? null,
      defaultHourlyRate:
        e.salaryAmount && e.salaryType === "HOURLY" ? Number(e.salaryAmount) : null,
    })),
    workers: workers.map((w) => ({
      id: w.id,
      name: w.name,
      role: w.specialty,
      defaultHourlyRate:
        w.rateType === "PER_HOUR" && w.rateAmount ? Number(w.rateAmount) : null,
    })),
  });
}
