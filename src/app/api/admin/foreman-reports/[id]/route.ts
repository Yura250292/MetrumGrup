import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, FOREMAN_REPORT_REVIEWERS } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { getForemanGetUrl } from "@/lib/foreman/r2";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  const report = await prisma.foremanReport.findFirst({
    where: { id, firmId: activeFirmId ?? undefined },
    include: {
      project: { select: { id: true, title: true, folderId: true } },
      createdBy: { select: { id: true, name: true, email: true, phone: true } },
      reviewedBy: { select: { id: true, name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          counterparty: { select: { id: true, name: true } },
          costCode: { select: { id: true, code: true, name: true } },
        },
      },
      attachments: true,
    },
  });

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Signed URLs для preview attachments
  const attachmentsWithUrls = await Promise.all(
    report.attachments.map(async (a) => ({
      id: a.id,
      r2Key: a.r2Key,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      previewUrl: await getForemanGetUrl(a.r2Key, 600).catch(() => null),
    })),
  );

  return NextResponse.json({
    report: {
      ...report,
      attachments: attachmentsWithUrls,
    },
  });
}
