import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  assertForemanCanAccessProject,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { ForemanReportStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ForemanReportStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

export async function GET(req: NextRequest) {
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);

  const status =
    statusParam && VALID_STATUSES.includes(statusParam as ForemanReportStatus)
      ? (statusParam as ForemanReportStatus)
      : undefined;

  const reports = await prisma.foremanReport.findMany({
    where: {
      createdById: session.user.id,
      firmId: firmId ?? undefined,
      status,
    },
    include: {
      project: { select: { id: true, title: true } },
      items: { select: { amount: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      project: r.project,
      status: r.status,
      occurredAt: r.occurredAt,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
      itemCount: r._count.items,
      total: r.items.reduce((sum, it) => sum + Number(it.amount), 0),
      createdAt: r.createdAt,
    })),
  });
}

/// Створює порожній DRAFT звіт для structured (per-stage) flow.
/// Items / progress додаються окремими endpoints.
const CreateBody = z.object({
  projectId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  /// Опціональні поля періоду. Якщо не передано — backend авто-обчислить:
  ///   • periodStart = (last APPROVED report.periodEnd + 1 day) ?? Project.startDate ?? today
  ///   • periodEnd   = today
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  /// Опціональна привʼязка до етапу.
  stageId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request", message: "Невалідні дані" }, { status: 400 });
  }

  try {
    await assertForemanCanAccessProject(session.user.id, firmId, parsed.data.projectId);
  } catch {
    return forbiddenResponse();
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { firmId: true, startDate: true, actualEndDate: true },
  });

  const now = new Date();

  // periodStart auto: останній APPROVED звіт для (project, foreman) +1 день,
  // інакше project.startDate, інакше today.
  let periodStart: Date;
  if (parsed.data.periodStart) {
    periodStart = new Date(parsed.data.periodStart);
  } else {
    const lastApproved = await prisma.foremanReport.findFirst({
      where: {
        projectId: parsed.data.projectId,
        createdById: session.user.id,
        status: "APPROVED",
        periodEnd: { not: null },
      },
      orderBy: { periodEnd: "desc" },
      select: { periodEnd: true },
    });
    if (lastApproved?.periodEnd) {
      const next = new Date(lastApproved.periodEnd);
      next.setUTCDate(next.getUTCDate() + 1);
      periodStart = next;
    } else if (project?.startDate) {
      periodStart = project.startDate;
    } else {
      periodStart = now;
    }
  }

  const periodEnd = parsed.data.periodEnd ? new Date(parsed.data.periodEnd) : now;
  // periodEnd має бути ≥ periodStart, інакше виправляємо на periodStart.
  const periodEndSafe = periodEnd < periodStart ? periodStart : periodEnd;

  const report = await prisma.foremanReport.create({
    data: {
      projectId: parsed.data.projectId,
      firmId: project?.firmId ?? firmId,
      createdById: session.user.id,
      status: "DRAFT",
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : now,
      periodStart,
      periodEnd: periodEndSafe,
      stageId: parsed.data.stageId ?? null,
    },
    select: { id: true, periodStart: true, periodEnd: true },
  });

  return NextResponse.json({ report }, { status: 201 });
}
