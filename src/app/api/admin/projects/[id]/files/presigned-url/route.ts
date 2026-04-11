import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { canUploadProjectFiles } from "@/lib/projects/access";
import { createProjectFileUploadUrl } from "@/lib/projects/files-service";

export const runtime = "nodejs";

/**
 * POST /api/admin/projects/[id]/files/presigned-url
 *
 * Body: { files: Array<{ name: string; type: string; size: number }> }
 *
 * Повертає масив presigned URL для PUT з браузера напряму в R2.
 * Використовується для файлів >4 МБ (обхід Vercel body limit).
 * Після успішного PUT клієнт окремо викликає POST /files з { r2Key, ... }
 * щоб зареєструвати файл у БД.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const allowed = await canUploadProjectFiles(id, session.user.id);
    if (!allowed) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const files = Array.isArray(body.files) ? body.files : null;
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "files обовʼязковий" }, { status: 400 });
    }

    const presignedUrls = await Promise.all(
      files.map(async (f: { name?: unknown; type?: unknown }) => {
        const fileName = typeof f.name === "string" ? f.name : "file";
        const contentType =
          typeof f.type === "string" && f.type ? f.type : "application/octet-stream";
        const { uploadUrl, key, publicUrl } = await createProjectFileUploadUrl({
          projectId: id,
          fileName,
          contentType,
        });
        return { fileName, contentType, uploadUrl, key, publicUrl };
      }),
    );

    return NextResponse.json({ presignedUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[projects/files/presigned-url] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
