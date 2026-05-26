import { NextRequest, NextResponse } from "next/server";
import type { FormSubmissionStatus, Prisma } from "@prisma/client";
import {
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_STATUSES: FormSubmissionStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
];

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireRole(["SUPER_ADMIN", "MANAGER", "HR"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const templateId = url.searchParams.get("templateId");
  const projectId = url.searchParams.get("projectId");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );

  const where: Prisma.FormSubmissionWhereInput = {
    firmId: firmId ?? undefined,
  };
  if (status && VALID_STATUSES.includes(status as FormSubmissionStatus)) {
    where.status = status as FormSubmissionStatus;
  }
  if (templateId) where.templateId = templateId;
  if (projectId) where.projectId = projectId;

  const submissions = await prisma.formSubmission.findMany({
    where,
    take: limit,
    orderBy: { submittedAt: { sort: "desc", nulls: "last" } },
    include: {
      template: { select: { id: true, name: true, category: true } },
      project: { select: { id: true, title: true } },
      submittedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
  });

  return NextResponse.json({
    data: submissions.map((s) => ({
      id: s.id,
      template: s.template,
      templateVersion: s.templateVersion,
      project: s.project,
      status: s.status,
      submittedBy: s.submittedBy,
      submittedAt: s.submittedAt,
      reviewedBy: s.reviewedBy,
      reviewedAt: s.reviewedAt,
      reviewNote: s.reviewNote,
      attachmentCount: s._count.attachments,
      createdAt: s.createdAt,
    })),
  });
}
