import { NextRequest, NextResponse } from "next/server";
import {
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  let session;
  try {
    session = await requireRole(["SUPER_ADMIN", "MANAGER", "HR"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  const { id } = await params;

  const sub = await prisma.formSubmission.findUnique({
    where: { id },
    include: {
      template: { select: { id: true, name: true, category: true } },
      project: { select: { id: true, title: true, slug: true } },
      task: { select: { id: true, title: true } },
      foremanReport: { select: { id: true, occurredAt: true } },
      submittedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      attachments: true,
    },
  });
  if (!sub) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  try {
    assertCanAccessFirm(session, sub.firmId);
  } catch {
    return forbiddenResponse();
  }

  // Підтягуємо revision snapshot — щоб клієнт зміг рендерити саме ту schema,
  // у якій подавали (template міг piти у новій version після цього).
  const revision = await prisma.formTemplateRevision.findUnique({
    where: {
      templateId_version: {
        templateId: sub.templateId,
        version: sub.templateVersion,
      },
    },
    select: { schema: true },
  });

  return NextResponse.json({
    data: {
      ...sub,
      revisionSchema: revision?.schema ?? null,
    },
  });
}
