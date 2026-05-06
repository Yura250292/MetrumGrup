import { NextRequest, NextResponse } from "next/server";
import { requireForeman, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
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
