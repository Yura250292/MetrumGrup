import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, FOREMAN_REPORT_REVIEWERS } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
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
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as ForemanReportStatus)
      ? (statusParam as ForemanReportStatus)
      : ("PENDING_APPROVAL" as ForemanReportStatus);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);

  const reports = await prisma.foremanReport.findMany({
    where: {
      firmId: activeFirmId ?? undefined,
      status,
    },
    include: {
      project: { select: { id: true, title: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
      _count: { select: { items: true, attachments: true } },
      items: { select: { amount: true } },
    },
    orderBy: status === "PENDING_APPROVAL" ? { submittedAt: "asc" } : { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      project: r.project,
      foreman: r.createdBy,
      reviewer: r.reviewedBy,
      status: r.status,
      occurredAt: r.occurredAt,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
      itemCount: r._count.items,
      attachmentCount: r._count.attachments,
      total: r.items.reduce((sum, it) => sum + Number(it.amount), 0),
      createdAt: r.createdAt,
    })),
  });
}
