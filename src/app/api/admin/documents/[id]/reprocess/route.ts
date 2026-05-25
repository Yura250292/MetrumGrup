import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { IncomingDocumentType, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { documentExtractionJob } from "@/lib/jobs/handlers";

export const runtime = "nodejs";

const REPROCESS_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const bodySchema = z.object({
  type: z
    .enum(["INVOICE", "CONTRACT", "ACT", "COMMERCIAL_OFFER", "RECEIPT", "KB2V", "KB3", "WAYBILL", "OTHER"])
    .optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!REPROCESS_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!firmId) return forbiddenResponse();

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірне тіло" }, { status: 400 });
  }

  const doc = await prisma.incomingDocument.findFirst({
    where: { id, firmId },
    select: { id: true, status: true },
  });
  if (!doc) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (doc.status === "LINKED" || doc.status === "ARCHIVED") {
    return NextResponse.json(
      { error: `Reprocess заборонено для статусу ${doc.status}` },
      { status: 409 },
    );
  }

  const updated = await prisma.incomingDocument.update({
    where: { id },
    data: {
      status: "PROCESSING",
      errorMessage: null,
      ...(parsed.data.type ? { type: parsed.data.type as IncomingDocumentType } : {}),
    },
    select: { id: true, status: true, type: true },
  });

  documentExtractionJob.enqueue({ documentId: id });

  return NextResponse.json({ document: updated });
}
