import { prisma } from "@/lib/prisma";
import { uploadFileToR2, deleteFileFromR2, isR2Configured } from "@/lib/r2-client";
import { FileType, type FileCategory, type FileVisibility } from "@prisma/client";
import { getProjectAccessContext } from "@/lib/projects/access";

export type ProjectFileDTO = {
  id: string;
  type: FileType;
  category: FileCategory;
  visibility: FileVisibility;
  name: string;
  url: string;
  r2Key: string | null;
  textContent: string | null;
  size: number;
  mimeType: string;
  createdAt: Date;
  uploadedBy: { id: string; name: string };
};

function detectFileType(mimeType: string): FileType {
  if (mimeType.startsWith("image/")) return "PHOTO_REPORT";
  if (mimeType === "application/pdf") return "PLAN";
  return "DOCUMENT";
}

function toDTO(row: {
  id: string;
  type: FileType;
  category: FileCategory;
  visibility: FileVisibility;
  name: string;
  url: string;
  r2Key: string | null;
  textContent: string | null;
  size: number;
  mimeType: string;
  createdAt: Date;
  uploadedBy: { id: string; name: string };
}): ProjectFileDTO {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    visibility: row.visibility,
    name: row.name,
    url: row.url,
    r2Key: row.r2Key,
    textContent: row.textContent,
    size: row.size,
    mimeType: row.mimeType,
    createdAt: row.createdAt,
    uploadedBy: row.uploadedBy,
  };
}

export async function uploadProjectFile(opts: {
  projectId: string;
  uploadedById: string;
  file: File;
  category?: FileCategory;
  visibility?: FileVisibility;
}): Promise<ProjectFileDTO> {
  if (!isR2Configured()) {
    throw new Error("R2 не налаштований. Заповніть R2_* змінні в .env");
  }

  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { id: true },
  });
  if (!project) throw new Error("Проєкт не знайдено");

  const uploaded = await uploadFileToR2(opts.file, `projects/${opts.projectId}`);

  const row = await prisma.projectFile.create({
    data: {
      projectId: opts.projectId,
      uploadedById: opts.uploadedById,
      type: detectFileType(opts.file.type),
      category: opts.category ?? "OTHER",
      visibility: opts.visibility ?? "TEAM",
      name: opts.file.name,
      url: uploaded.url,
      r2Key: uploaded.key,
      size: opts.file.size,
      mimeType: opts.file.type || "application/octet-stream",
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return toDTO(row);
}

export async function createTextNote(opts: {
  projectId: string;
  uploadedById: string;
  title: string;
  text: string;
}): Promise<ProjectFileDTO> {
  const trimmedText = opts.text.trim();
  if (!trimmedText) throw new Error("Текст опису не може бути порожнім");

  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { id: true },
  });
  if (!project) throw new Error("Проєкт не знайдено");

  const row = await prisma.projectFile.create({
    data: {
      projectId: opts.projectId,
      uploadedById: opts.uploadedById,
      type: "DOCUMENT",
      name: opts.title.trim() || "Опис",
      url: "",
      r2Key: null,
      textContent: trimmedText,
      size: Buffer.byteLength(trimmedText, "utf-8"),
      mimeType: "text/plain",
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return toDTO(row);
}

export async function listProjectFiles(
  projectId: string,
  currentUserId?: string,
): Promise<ProjectFileDTO[]> {
  // Resolve visibility window for the requesting user.
  // Default (no userId) — full TEAM+CLIENT+INTERNAL list, used in legacy callers.
  let allowedVisibilities: FileVisibility[] = ["TEAM", "CLIENT", "INTERNAL"];
  if (currentUserId) {
    const ctx = await getProjectAccessContext(projectId, currentUserId);
    if (!ctx || !ctx.canView) return [];
    if (ctx.isClientOfProject) {
      allowedVisibilities = ["CLIENT"];
    } else if (ctx.canViewInternalFiles || ctx.isSuperAdmin) {
      allowedVisibilities = ["TEAM", "CLIENT", "INTERNAL"];
    } else {
      allowedVisibilities = ["TEAM", "CLIENT"];
    }
  }

  const rows = await prisma.projectFile.findMany({
    where: { projectId, visibility: { in: allowedVisibilities } },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });
  return rows.map(toDTO);
}

export async function deleteProjectFile(
  fileId: string,
  currentUserId: string,
  isAdmin: boolean
): Promise<void> {
  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
    select: { id: true, uploadedById: true, r2Key: true },
  });
  if (!file) throw new Error("Файл не знайдено");
  if (file.uploadedById !== currentUserId && !isAdmin) {
    throw new Error("Forbidden");
  }

  if (file.r2Key) {
    try {
      await deleteFileFromR2(file.r2Key);
    } catch (err) {
      console.error("[files-service] Failed to delete R2 file:", err);
      // Продовжуємо видалення з БД навіть якщо R2 не вдалось
    }
  }

  await prisma.projectFile.delete({ where: { id: fileId } });
}
