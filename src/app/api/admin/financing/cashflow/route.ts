import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  computeCashflow,
  type CashflowGranularity,
} from "@/lib/financing/cashflow";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

const VALID_GRANULARITY: CashflowGranularity[] = ["DAY", "WEEK", "MONTH"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);

  const granularityRaw = searchParams.get("granularity") ?? "WEEK";
  const granularity = VALID_GRANULARITY.includes(granularityRaw as CashflowGranularity)
    ? (granularityRaw as CashflowGranularity)
    : "WEEK";

  // Default range: today − 30d → today + 90d
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const defaultTo = new Date(now);
  defaultTo.setDate(defaultTo.getDate() + 90);

  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : defaultFrom;
  const to = toRaw ? new Date(toRaw) : defaultTo;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Некоректний діапазон дат" }, { status: 400 });
  }
  if (from >= to) {
    return NextResponse.json({ error: "from має бути < to" }, { status: 400 });
  }

  const projectId = searchParams.get("projectId");
  const folderId = searchParams.get("folderId");

  try {
    const data = await computeCashflow({
      from,
      to,
      granularity,
      projectId: projectId && projectId !== "" ? projectId : undefined,
      folderId: folderId && folderId !== "" ? folderId : undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[cashflow] error:", error);
    return NextResponse.json(
      { error: "Помилка обчислення cashflow" },
      { status: 500 },
    );
  }
}
