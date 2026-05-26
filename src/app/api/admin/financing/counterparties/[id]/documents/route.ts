import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPresignedUploadUrl } from "@/lib/r2-client";
import {
  READ_ROLES,
  WRITE_ROLES,
  isAccessResponse,
  requireCounterpartyAccess,
} from "@/lib/counterparties/access";

export const runtime = "nodejs";

const DOC_TYPES = [
  "LICENSE",
  "PERMIT",
  "CERTIFICATE",
  "INSURANCE",
  "CONTRACT",
  "STATUTE",
  "REGISTRATION",
  "OTHER",
] as const;

// POST використовується у двох сценаріях, керованих полем `step`:
//   1. step="presign" — фронт просить URL для прямого upload у R2.
//   2. step="record" — фронт зберігає метадані (після успішного upload).
const presignSchema = z.object({
  step: z.literal("presign"),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
});
const recordSchema = z.object({
  step: z.literal("record"),
  type: z.enum(DOC_TYPES),
  title: z.string().trim().min(1).max(200),
  fileUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1),
  issuedAt: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
});
const postSchema = z.discriminatedUnion("step", [presignSchema, recordSchema]);

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: READ_ROLES,
  });
  if (isAccessResponse(access)) return access;

  const documents = await prisma.counterpartyDocument.findMany({
    where: { counterpartyId: id, isActive: true },
    orderBy: { uploadedAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true, avatar: true } },
    },
  });

  return NextResponse.json({ documents });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: WRITE_ROLES,
  });
  if (isAccessResponse(access)) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невірний JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (data.step === "presign") {
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (data.fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Файл занадто великий (макс. 50MB)" },
        { status: 400 },
      );
    }
    const presigned = await createPresignedUploadUrl(
      data.fileName,
      data.mimeType,
      `counterparties/${id}`,
    );
    return NextResponse.json(presigned);
  }

  // step === "record"
  const document = await prisma.counterpartyDocument.create({
    data: {
      counterpartyId: id,
      type: data.type,
      title: data.title,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      issuedAt: data.issuedAt ? new Date(data.issuedAt) : null,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      uploadedById: access.session.user.id,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, avatar: true } },
    },
  });
  return NextResponse.json({ document }, { status: 201 });
}
