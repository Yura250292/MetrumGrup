import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { deleteFileFromR2 } from "@/lib/r2-client";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

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
