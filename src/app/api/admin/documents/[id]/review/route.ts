import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

export const runtime = "nodejs";

const REVIEW_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!REVIEW_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!firmId) return forbiddenResponse();

  const { id } = await params;
  const doc = await prisma.incomingDocument.findFirst({
    where: { id, firmId },
    select: { id: true, status: true },
  });
  if (!doc) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (doc.status !== "PARSED") {
    return NextResponse.json(
      { error: `Можна review тільки PARSED, поточний статус: ${doc.status}` },
      { status: 409 },
    );
  }

  const updated = await prisma.incomingDocument.update({
    where: { id },
    data: {
      status: "REVIEWED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
    select: { id: true, status: true, reviewedAt: true },
  });

  return NextResponse.json({ document: updated });
}
