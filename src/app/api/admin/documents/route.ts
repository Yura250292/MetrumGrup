import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const querySchema = z.object({
  status: z.enum(["PROCESSING", "PARSED", "REVIEWED", "LINKED", "ARCHIVED", "FAILED"]).optional(),
  type: z
    .enum(["INVOICE", "CONTRACT", "ACT", "COMMERCIAL_OFFER", "RECEIPT", "KB2V", "KB3", "WAYBILL", "OTHER"])
    .optional(),
  source: z.enum(["UPLOAD", "EMAIL", "FOREMAN", "SCAN", "API"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  q: z.string().trim().optional(),
  take: z.coerce.number().int().positive().max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!firmId) return forbiddenResponse();

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні параметри", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { status, type, source, dateFrom, dateTo, q, take, skip } = parsed.data;

  const where: Prisma.IncomingDocumentWhereInput = { firmId };
  if (status) where.status = status;
  if (type) where.type = type;
  if (source) where.source = source;
  if (dateFrom || dateTo) {
    where.uploadedAt = {};
    if (dateFrom) where.uploadedAt.gte = new Date(dateFrom);
    if (dateTo) where.uploadedAt.lte = new Date(dateTo);
  }
  if (q) {
    where.OR = [
      { originalFileName: { contains: q, mode: "insensitive" } },
      { emailFrom: { contains: q, mode: "insensitive" } },
      { emailSubject: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.incomingDocument.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        type: true,
        source: true,
        status: true,
        originalFileName: true,
        fileSizeBytes: true,
        mimeType: true,
        confidence: true,
        uploadedAt: true,
        reviewedAt: true,
        linkedEntityType: true,
        linkedEntityId: true,
        errorMessage: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.incomingDocument.count({ where }),
  ]);

  return NextResponse.json({ items, total, take, skip });
}
