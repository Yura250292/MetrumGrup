import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { deleteFileFromR2, r2Client } from "@/lib/r2-client";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

/** GET returns a short-lived presigned URL for viewing the attachment */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id, attachmentId } = await ctx.params;
  const attachment = await prisma.financeEntryAttachment.findFirst({
    where: { id: attachmentId, entryId: id },
  });
  if (!attachment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "metrum",
      Key: attachment.r2Key,
    });
    const url = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
    return NextResponse.json({
      url,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
    });
  } catch (error) {
    console.error("[financing/attachments/GET] error:", error);
    return NextResponse.json({ error: "Помилка отримання файлу" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id, attachmentId } = await ctx.params;
  const attachment = await prisma.financeEntryAttachment.findFirst({
    where: { id: attachmentId, entryId: id },
  });
  if (!attachment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  try {
    await deleteFileFromR2(attachment.r2Key).catch((err) => {
      console.warn("[financing/attachments/DELETE] R2 delete failed:", err);
    });
    await prisma.financeEntryAttachment.delete({ where: { id: attachmentId } });
    await prisma.financeEntry.update({
      where: { id },
      data: { updatedById: session.user.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[financing/attachments/DELETE] error:", error);
    return NextResponse.json({ error: "Помилка видалення" }, { status: 500 });
  }
}
