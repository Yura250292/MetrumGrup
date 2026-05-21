import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { uploadFileToR2 } from "@/lib/r2-client";
import { getProjectAccessContext } from "@/lib/projects/access";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB на файл
const MAX_FILES = 10;
const ALLOWED_MIME = [
  // documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // text
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  // images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

async function loadTaskWithAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      createdById: true,
      project: { select: { personalInboxUserId: true } },
    },
  });
  if (!task) return { error: "Задачу не знайдено", status: 404 } as const;
  const ctx = await getProjectAccessContext(task.projectId, userId);
  if (ctx?.canViewTasks) return { task, ctx } as const;

  // Fallback: задача у Personal Inbox і я — assignee/creator/watcher.
  if (task.project?.personalInboxUserId) {
    const isParticipant =
      task.createdById === userId ||
      (await prisma.task.count({
        where: {
          id: taskId,
          OR: [
            { assignees: { some: { userId } } },
            { watchers: { some: { userId } } },
          ],
        },
      })) > 0;
    if (isParticipant) return { task, ctx } as const;
  }

  return { error: "Немає доступу", status: 403 } as const;
}

/**
 * GET — список вкладень задачі.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { taskId } = await params;
  const res = await loadTaskWithAccess(taskId, session.user.id);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  const items = await prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    data: items.map((a) => ({
      id: a.id,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt.toISOString(),
      uploadedBy: a.uploadedBy ? { id: a.uploadedBy.id, name: a.uploadedBy.name } : null,
      // Публічний URL — формується з r2Key через CDN.
      url: r2PublicUrl(a.r2Key),
    })),
  });
}

/**
 * POST — multipart upload. Завантажує файл(и) у R2 і створює рядки.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { taskId } = await params;
  const res = await loadTaskWithAccess(taskId, session.user.id);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Не передано жодного файлу" },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Максимум ${MAX_FILES} файлів за раз` },
      { status: 400 },
    );
  }
  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Файл «${f.name}» перевищує 25 МБ` },
        { status: 400 },
      );
    }
    if (f.type && !ALLOWED_MIME.includes(f.type)) {
      return NextResponse.json(
        { error: `Тип файлу «${f.type}» не дозволено` },
        { status: 400 },
      );
    }
  }

  // Завантажуємо паралельно, потім створюємо рядки.
  const uploaded = await Promise.all(
    files.map((f) => uploadFileToR2(f, `tasks/${taskId}`)),
  );

  const created = await prisma.$transaction(
    uploaded.map((u, i) =>
      prisma.taskAttachment.create({
        data: {
          taskId,
          r2Key: u.key,
          originalName: files[i]!.name,
          mimeType: u.mimeType || "application/octet-stream",
          size: u.size,
          uploadedById: session.user.id,
        },
      }),
    ),
  );

  return NextResponse.json({
    data: created.map((a) => ({
      id: a.id,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt.toISOString(),
      url: r2PublicUrl(a.r2Key),
    })),
  });
}

function r2PublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return `/r2/${key}`;
  return `${base}/${key}`;
}
