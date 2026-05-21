import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { deleteFileFromR2 } from "@/lib/r2-client";
import { getProjectAccessContext } from "@/lib/projects/access";

/**
 * Видалення вкладення. Дозволено:
 *  - SUPER_ADMIN / canDeleteTasks
 *  - той, хто завантажив (uploadedById)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; attachmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { taskId, attachmentId } = await params;

  const attachment = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, taskId: true, r2Key: true, uploadedById: true },
  });
  if (!attachment || attachment.taskId !== taskId) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) return NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 });

  const ctx = await getProjectAccessContext(task.projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }
  const isUploader = attachment.uploadedById === session.user.id;
  const canDelete = ctx.canDeleteTasks || ctx.canEditAnyTask || isUploader;
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Best-effort delete from R2; завжди прибираємо рядок із БД.
  try {
    await deleteFileFromR2(attachment.r2Key);
  } catch (err) {
    console.error("[task-attachment/delete] R2 cleanup failed:", err);
  }
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });

  return NextResponse.json({ ok: true });
}
