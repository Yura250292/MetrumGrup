import { NextRequest, NextResponse } from "next/server";
import type { FormCategory, Prisma } from "@prisma/client";
import {
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { firmIdForNewEntity } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";
import { FormSchemaZ } from "@/lib/forms/validators";
import { z } from "zod";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES: FormCategory[] = [
  "DAILY_REPORT",
  "SAFETY",
  "QUALITY",
  "ACCEPTANCE",
  "KB2V",
  "KB3",
  "CUSTOM",
];

const CreateBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(VALID_CATEGORIES as [FormCategory, ...FormCategory[]]),
  schema: FormSchemaZ,
});

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
  const categoryParam = url.searchParams.get("category");
  const isActiveParam = url.searchParams.get("isActive");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    500,
  );

  const where: Prisma.FormTemplateWhereInput = {
    firmId: firmId ?? undefined,
  };
  if (
    categoryParam &&
    VALID_CATEGORIES.includes(categoryParam as FormCategory)
  ) {
    where.category = categoryParam as FormCategory;
  }
  if (isActiveParam === "true") where.isActive = true;
  if (isActiveParam === "false") where.isActive = false;

  const templates = await prisma.formTemplate.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { submissions: true, revisions: true } },
    },
  });

  return NextResponse.json({
    data: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      version: t.version,
      isActive: t.isActive,
      firmId: t.firmId,
      createdBy: t.createdBy,
      submissionCount: t._count.submissions,
      revisionCount: t._count.revisions,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireRole(["SUPER_ADMIN", "MANAGER", "HR"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ValidationError", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const firmId = firmIdForNewEntity(session);

  // Створюємо у транзакції: template v1 + перший revision snapshot.
  const created = await prisma.$transaction(async (tx) => {
    const tpl = await tx.formTemplate.create({
      data: {
        firmId,
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        schema: parsed.data.schema as unknown as Prisma.InputJsonValue,
        version: 1,
        isActive: true,
        createdById: session.user.id,
      },
    });
    await tx.formTemplateRevision.create({
      data: {
        templateId: tpl.id,
        version: 1,
        schema: parsed.data.schema as unknown as Prisma.InputJsonValue,
        createdById: session.user.id,
        changeNote: "Initial version",
      },
    });
    return tpl;
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
