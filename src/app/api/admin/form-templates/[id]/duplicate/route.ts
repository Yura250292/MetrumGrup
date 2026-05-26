import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { assertCanAccessFirm, firmIdForNewEntity } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  let session;
  try {
    session = await requireRole(["SUPER_ADMIN", "MANAGER", "HR"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  const { id } = await params;

  const src = await prisma.formTemplate.findUnique({ where: { id } });
  if (!src) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  try {
    assertCanAccessFirm(session, src.firmId);
  } catch {
    return forbiddenResponse();
  }

  const firmId = firmIdForNewEntity(session);

  const created = await prisma.$transaction(async (tx) => {
    const copy = await tx.formTemplate.create({
      data: {
        firmId,
        name: `${src.name} (копія)`,
        description: src.description,
        category: src.category,
        schema: src.schema as Prisma.InputJsonValue,
        version: 1,
        isActive: true,
        createdById: session.user.id,
      },
    });
    await tx.formTemplateRevision.create({
      data: {
        templateId: copy.id,
        version: 1,
        schema: src.schema as Prisma.InputJsonValue,
        changeNote: `Дубль з ${src.id} v${src.version}`,
        createdById: session.user.id,
      },
    });
    return copy;
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
