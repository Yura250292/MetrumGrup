import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import type { IncomingDocumentType, Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor, firmIdForNewEntity } from "@/lib/firm/scope";
import { uploadDocumentToR2 } from "@/lib/r2/documents";
import { documentExtractionJob } from "@/lib/jobs/handlers";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const VALID_TYPES: IncomingDocumentType[] = [
  "INVOICE",
  "CONTRACT",
  "ACT",
  "COMMERCIAL_OFFER",
  "RECEIPT",
  "KB2V",
  "KB3",
  "WAYBILL",
  "OTHER",
];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!firmId || !isHomeFirmFor(session, firmId)) return forbiddenResponse();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Очікувався multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Поле 'file' обовʼязкове" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Файл порожній" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Файл занадто великий (макс ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }
  if (!ACCEPTED_MIME.has(file.type)) {
    return NextResponse.json({ error: `Mime '${file.type}' не підтримується` }, { status: 415 });
  }

  const typeRaw = (formData.get("type") as string) ?? "INVOICE";
  const type: IncomingDocumentType = VALID_TYPES.includes(typeRaw as IncomingDocumentType)
    ? (typeRaw as IncomingDocumentType)
    : "INVOICE";

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  const dedup = await prisma.incomingDocument.findUnique({
    where: { firmId_fileHash: { firmId, fileHash } },
    select: { id: true, status: true },
  });
  if (dedup) {
    return NextResponse.json(
      { error: "Цей файл уже завантажено", existingId: dedup.id, status: dedup.status },
      { status: 409 },
    );
  }

  const stampFirmId = firmIdForNewEntity(session, firmId);
  const { key } = await uploadDocumentToR2({
    firmId: stampFirmId,
    originalName: file.name,
    mimeType: file.type,
    body: buffer,
  });

  const created = await prisma.incomingDocument.create({
    data: {
      firmId: stampFirmId,
      type,
      source: "UPLOAD",
      status: "PROCESSING",
      originalFileUrl: key,
      originalFileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type,
      fileHash,
      uploadedById: session.user.id,
      extractedData: Prisma.JsonNull,
    },
    select: { id: true, status: true, type: true, originalFileName: true },
  });

  documentExtractionJob.enqueue({ documentId: created.id });

  return NextResponse.json({ document: created }, { status: 201 });
}
