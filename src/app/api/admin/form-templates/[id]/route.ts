import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";
import { FormSchemaZ } from "@/lib/forms/validators";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UpdateBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  schema: FormSchemaZ.optional(),
  isActive: z.boolean().optional(),
  changeNote: z.string().max(500).optional(),
});

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

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

  const tpl = await prisma.formTemplate.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { submissions: true, revisions: true } },
    },
  });
  if (!tpl) return NextResponse.json({ error: "NotFound" }, { status: 404 });

  try {
    assertCanAccessFirm(session, tpl.firmId);
  } catch {
    return forbiddenResponse();
  }

  return NextResponse.json({ data: tpl });
}

export async function PUT(req: NextRequest, { params }: Params) {
  let session;
  try {
    session = await requireRole(["SUPER_ADMIN", "MANAGER", "HR"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = UpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ValidationError", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tpl = await prisma.formTemplate.findUnique({ where: { id } });
  if (!tpl) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  try {
    assertCanAccessFirm(session, tpl.firmId);
  } catch {
    return forbiddenResponse();
  }

  const updates: Prisma.FormTemplateUpdateInput = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }
  if (parsed.data.isActive !== undefined) {
    updates.isActive = parsed.data.isActive;
  }

  // Якщо schema змінилася (deep-equal) — version++ + новий revision у тій же транзакції.
  const schemaChanged =
    parsed.data.schema !== undefined &&
    !deepEqual(parsed.data.schema, tpl.schema);

  if (!schemaChanged) {
    const updated = await prisma.formTemplate.update({
      where: { id },
      data: updates,
    });
    return NextResponse.json({ data: updated });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const newVersion = tpl.version + 1;
    const u = await tx.formTemplate.update({
      where: { id },
      data: {
        ...updates,
        schema: parsed.data.schema as unknown as Prisma.InputJsonValue,
        version: newVersion,
      },
    });
    await tx.formTemplateRevision.create({
      data: {
        templateId: id,
        version: newVersion,
        schema: parsed.data.schema as unknown as Prisma.InputJsonValue,
        changeNote: parsed.data.changeNote ?? null,
        createdById: session.user.id,
      },
    });
    return u;
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let session;
  try {
    session = await requireRole(["SUPER_ADMIN", "MANAGER", "HR"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  const { id } = await params;

  const tpl = await prisma.formTemplate.findUnique({
    where: { id },
    include: { _count: { select: { submissions: true } } },
  });
  if (!tpl) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  try {
    assertCanAccessFirm(session, tpl.firmId);
  } catch {
    return forbiddenResponse();
  }

  if (tpl._count.submissions > 0) {
    // Soft-delete: лишаємо ряд, але ховаємо з активних. Реальний delete заборонено
    // через FK на FormSubmission (RESTRICT).
    await prisma.formTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true, soft: true });
  }

  await prisma.formTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
