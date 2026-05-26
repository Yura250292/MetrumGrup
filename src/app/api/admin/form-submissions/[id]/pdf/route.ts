import { NextRequest, NextResponse } from "next/server";
import {
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";
import { renderDefaultFormPdf } from "@/lib/forms/pdf/default";
import { renderKb2vFormPdf } from "@/lib/forms/pdf/kb2v";
import type { FormSchema, SubmissionData } from "@/lib/forms/schema";
import type { FormSubmissionStatus } from "@prisma/client";

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
      project: { select: { title: true } },
      submittedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
  });
  if (!sub) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  try {
    assertCanAccessFirm(session, sub.firmId);
  } catch {
    return forbiddenResponse();
  }

  // Завантажуємо revision schema (snapshot версії, у якій подавали).
  const revision = await prisma.formTemplateRevision.findUnique({
    where: {
      templateId_version: {
        templateId: sub.templateId,
        version: sub.templateVersion,
      },
    },
    select: { schema: true },
  });
  if (!revision) {
    return NextResponse.json(
      { error: "RevisionNotFound", message: "Snapshot версії не знайдено" },
      { status: 404 },
    );
  }

  const schema = revision.schema as unknown as FormSchema;
  const input = {
    templateName: sub.template.name,
    status: sub.status as FormSubmissionStatus,
    submittedBy: sub.submittedBy.name,
    submittedAt: sub.submittedAt?.toISOString() ?? null,
    reviewedBy: sub.reviewedBy?.name ?? null,
    reviewedAt: sub.reviewedAt?.toISOString() ?? null,
    projectTitle: sub.project?.title ?? null,
    schema,
    data: sub.data as unknown as SubmissionData,
  };

  // TODO: завантажити NotoSans TTF з public/fonts і передавати у fontBytes,
  // щоб уникнути транслітерації кирилиці.

  const bytes =
    sub.template.category === "KB2V"
      ? await renderKb2vFormPdf(input)
      : await renderDefaultFormPdf(input);

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="form-${id}.pdf"`,
    },
  });
}
