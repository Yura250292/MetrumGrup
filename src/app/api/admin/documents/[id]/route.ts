import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getDocumentGetUrl } from "@/lib/r2/documents";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

async function loadDocumentForFirm(id: string, firmId: string) {
  return prisma.incomingDocument.findFirst({
    where: { id, firmId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      extractionLogs: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          model: true,
          tokensInput: true,
          tokensOutput: true,
          durationMs: true,
          success: true,
          errorMessage: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!firmId) return forbiddenResponse();

  const { id } = await params;
  const document = await loadDocumentForFirm(id, firmId);
  if (!document) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  let signedUrl: string | null = null;
  try {
    signedUrl = await getDocumentGetUrl(document.originalFileUrl, 600);
  } catch {
    signedUrl = null;
  }

  return NextResponse.json({ document, signedUrl });
}

const patchSchema = z.object({
  extractedData: z.record(z.string(), z.unknown()).optional(),
  type: z
    .enum(["INVOICE", "CONTRACT", "ACT", "COMMERCIAL_OFFER", "RECEIPT", "KB2V", "KB3", "WAYBILL", "OTHER"])
    .optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!firmId) return forbiddenResponse();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірне тіло", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.incomingDocument.findFirst({
    where: { id, firmId },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (existing.status === "ARCHIVED" || existing.status === "LINKED") {
    return NextResponse.json(
      { error: "Документ заархівовано або привʼязано — редагування заборонене" },
      { status: 409 },
    );
  }

  const data: Prisma.IncomingDocumentUpdateInput = {};
  if (parsed.data.type) data.type = parsed.data.type;
  if (parsed.data.extractedData) {
    data.extractedData = parsed.data.extractedData as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.incomingDocument.update({
    where: { id },
    data,
    select: { id: true, status: true, type: true, extractedData: true },
  });

  return NextResponse.json({ document: updated });
}
