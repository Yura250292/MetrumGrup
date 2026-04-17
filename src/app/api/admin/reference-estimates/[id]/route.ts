import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, ESTIMATE_ROLES } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ESTIMATE_ROLES.includes(session.user.role as any)) {
    return forbiddenResponse();
  }

  const { id } = await params;

  const reference = await prisma.referenceEstimate.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!reference || !reference.isActive) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  return NextResponse.json({ data: reference });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ESTIMATE_ROLES.includes(session.user.role as any)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  const existing = await prisma.referenceEstimate.findUnique({
    where: { id },
    select: { id: true, isActive: true, title: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  await prisma.referenceEstimate.update({
    where: { id },
    data: { isActive: false },
  });

  await auditLog({
    userId: session.user.id,
    action: "DELETE",
    entity: "ReferenceEstimate",
    entityId: id,
    oldData: { title: existing.title },
  });

  return NextResponse.json({ data: { id } });
}
