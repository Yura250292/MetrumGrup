import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import {
  createTextNote,
  listProjectFiles,
  registerProjectFileFromR2,
  uploadProjectFile,
} from "@/lib/projects/files-service";
import {
  canUploadProjectFiles,
  canViewProject,
} from "@/lib/projects/access";
import { notifyProjectMembers } from "@/lib/notifications/create";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[projects/files] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const ok = await canViewProject(id, session.user.id);
    if (!ok) return forbiddenResponse();
    const files = await listProjectFiles(id, session.user.id);
    return NextResponse.json({ files });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const allowed = await canUploadProjectFiles(id, session.user.id);
    if (!allowed) return forbiddenResponse();

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // File upload mode
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Поле 'file' відсутнє або некоректне" },
          { status: 400 }
        );
      }

      const visibilityRaw = formData.get("visibility");
      const categoryRaw = formData.get("category");
      const visibility =
        typeof visibilityRaw === "string" &&
        ["TEAM", "CLIENT", "INTERNAL"].includes(visibilityRaw)
          ? (visibilityRaw as "TEAM" | "CLIENT" | "INTERNAL")
          : undefined;
      const category =
        typeof categoryRaw === "string" &&
        ["PLAN", "CONTRACT", "TECH_DOC", "NOTE", "PHOTO_ATTACHMENT", "OTHER"].includes(
          categoryRaw,
        )
          ? (categoryRaw as
              | "PLAN"
              | "CONTRACT"
              | "TECH_DOC"
              | "NOTE"
              | "PHOTO_ATTACHMENT"
              | "OTHER")
          : undefined;

      const dto = await uploadProjectFile({
        projectId: id,
        uploadedById: session.user.id,
        file,
        visibility,
        category,
      });
      try {
        const project = await prisma.project.findUnique({
          where: { id },
          select: { title: true },
        });
        await notifyProjectMembers({
          projectId: id,
          actorId: session.user.id,
          type: "PROJECT_FILE_ADDED",
          title: `Новий файл у проєкті «${project?.title ?? ""}»`,
          body: dto.name,
          relatedEntity: "ProjectFile",
          relatedId: id,
        });
      } catch (err) {
        console.error("[projects/files] notifyProjectMembers failed:", err);
      }
      return NextResponse.json({ file: dto }, { status: 201 });
    }

    // JSON mode — або реєстрація R2-аплоаду (presigned), або текстова нотатка.
    const json = await request.json();

    // 1) Реєстрація вже залитого в R2 файлу (presigned-URL flow для >4 МБ)
    if (typeof json.r2Key === "string" && json.r2Key.length > 0) {
      const visibilityRaw = json.visibility;
      const categoryRaw = json.category;
      const visibility =
        typeof visibilityRaw === "string" &&
        ["TEAM", "CLIENT", "INTERNAL"].includes(visibilityRaw)
          ? (visibilityRaw as "TEAM" | "CLIENT" | "INTERNAL")
          : undefined;
      const category =
        typeof categoryRaw === "string" &&
        ["PLAN", "CONTRACT", "TECH_DOC", "NOTE", "PHOTO_ATTACHMENT", "OTHER"].includes(
          categoryRaw,
        )
          ? (categoryRaw as
              | "PLAN"
              | "CONTRACT"
              | "TECH_DOC"
              | "NOTE"
              | "PHOTO_ATTACHMENT"
              | "OTHER")
          : undefined;

      const name = typeof json.name === "string" ? json.name : "file";
      const size = Number.isFinite(Number(json.size)) ? Number(json.size) : 0;
      const mimeType =
        typeof json.mimeType === "string" && json.mimeType
          ? json.mimeType
          : "application/octet-stream";

      const dto = await registerProjectFileFromR2({
        projectId: id,
        uploadedById: session.user.id,
        r2Key: json.r2Key,
        name,
        size,
        mimeType,
        visibility,
        category,
      });

      try {
        const project = await prisma.project.findUnique({
          where: { id },
          select: { title: true },
        });
        await notifyProjectMembers({
          projectId: id,
          actorId: session.user.id,
          type: "PROJECT_FILE_ADDED",
          title: `Новий файл у проєкті «${project?.title ?? ""}»`,
          body: dto.name,
          relatedEntity: "ProjectFile",
          relatedId: id,
        });
      } catch (err) {
        console.error("[projects/files] notifyProjectMembers failed:", err);
      }
      return NextResponse.json({ file: dto }, { status: 201 });
    }

    // 2) Текстова нотатка
    const title = typeof json.title === "string" ? json.title : "";
    const text = typeof json.text === "string" ? json.text : "";
    if (!text.trim()) {
      return NextResponse.json(
        { error: "Поле 'text' обов'язкове" },
        { status: 400 }
      );
    }

    const dto = await createTextNote({
      projectId: id,
      uploadedById: session.user.id,
      title,
      text,
    });
    try {
      const project = await prisma.project.findUnique({
        where: { id },
        select: { title: true },
      });
      await notifyProjectMembers({
        projectId: id,
        actorId: session.user.id,
        type: "PROJECT_FILE_ADDED",
        title: `Нова нотатка у проєкті «${project?.title ?? ""}»`,
        body: dto.name,
        relatedEntity: "ProjectFile",
        relatedId: id,
      });
    } catch (err) {
      console.error("[projects/files] notifyProjectMembers failed:", err);
    }
    return NextResponse.json({ file: dto }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
