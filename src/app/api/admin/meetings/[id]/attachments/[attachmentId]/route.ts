import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { deleteFileFromR2 } from "@/lib/r2-client";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id, attachmentId } = await params;
  const attachment = await prisma.meetingAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, meetingId: true, r2Key: true },
  });

  if (!attachment || attachment.meetingId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await deleteFileFromR2(attachment.r2Key);
  } catch (err) {
    console.error("Failed to delete R2 attachment:", err);
  }

  await prisma.meetingAttachment.delete({ where: { id: attachmentId } });

  return NextResponse.json({ success: true });
}
