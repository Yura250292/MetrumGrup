import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  SubmissionPayloadSchema,
  validateSubmissionAgainstSchema,
} from "@/lib/forms/validators";
import type { FormSchema, SubmissionData } from "@/lib/forms/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let session;
  let firmId: string | null;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const parsed = SubmissionPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ValidationError", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { clientUuid, templateId, templateVersion, projectId, taskId, foremanReportId, data } =
    parsed.data;

  // Idempotency: повторний POST з тим самим clientUuid → повертаємо існуючий.
  const existing = await prisma.formSubmission.findUnique({
    where: { clientUuid },
    select: { id: true, status: true, firmId: true },
  });
  if (existing) {
    // Доступ: foreman не може "переписати" чужий submission.
    if (existing.firmId && firmId && existing.firmId !== firmId) {
      return forbiddenResponse();
    }
    return NextResponse.json(
      { id: existing.id, status: existing.status, idempotent: true },
      { status: 200 },
    );
  }

  // Перевіряємо template + правильність версії.
  const tpl = await prisma.formTemplate.findFirst({
    where: { id: templateId, isActive: true, firmId: firmId ?? undefined },
    select: { id: true, version: true, schema: true },
  });
  if (!tpl) return NextResponse.json({ error: "TemplateNotFound" }, { status: 404 });

  // Підтягуємо revision schema для версії, у якій подавали (може бути стара).
  let schemaToValidate: FormSchema | null = null;
  if (tpl.version === templateVersion) {
    schemaToValidate = tpl.schema as unknown as FormSchema;
  } else {
    const rev = await prisma.formTemplateRevision.findUnique({
      where: {
        templateId_version: { templateId, version: templateVersion },
      },
      select: { schema: true },
    });
    if (!rev) {
      return NextResponse.json(
        { error: "RevisionNotFound", message: `Версія ${templateVersion} не знайдена` },
        { status: 404 },
      );
    }
    schemaToValidate = rev.schema as unknown as FormSchema;
  }

  const result = validateSubmissionAgainstSchema(
    data as SubmissionData,
    schemaToValidate,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: "SchemaValidationError", errors: result.errors },
      { status: 400 },
    );
  }

  // Project access — якщо лінкуємо submission до проєкту, перевіримо, що foreman
  // призначений на нього.
  if (projectId) {
    const { assertForemanCanAccessProject } = await import("@/lib/auth-utils");
    try {
      await assertForemanCanAccessProject(session.user.id, firmId, projectId);
    } catch {
      return forbiddenResponse();
    }
  }

  const created = await prisma.formSubmission.create({
    data: {
      firmId,
      templateId,
      templateVersion,
      projectId: projectId ?? null,
      taskId: taskId ?? null,
      foremanReportId: foremanReportId ?? null,
      submittedById: session.user.id,
      data: data as Prisma.InputJsonValue,
      status: "SUBMITTED",
      submittedAt: new Date(),
      clientUuid,
    },
  });

  // Fire-and-forget: DM рев'юверам у тій самій фірмі.
  const { notifySubmissionSubmitted } = await import("@/lib/forms/notifications");
  void notifySubmissionSubmitted(created.id);

  return NextResponse.json(
    { id: created.id, status: created.status, idempotent: false },
    { status: 201 },
  );
}
