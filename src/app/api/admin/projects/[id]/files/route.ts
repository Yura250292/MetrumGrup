import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import {
  createTextNote,
  listProjectFiles,
  uploadProjectFile,
} from "@/lib/projects/files-service";

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
    await requireStaffAccess();
    const { id } = await ctx.params;
    const files = await listProjectFiles(id);
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

      const dto = await uploadProjectFile({
        projectId: id,
        uploadedById: session.user.id,
        file,
      });
      return NextResponse.json({ file: dto }, { status: 201 });
    }

    // JSON mode (text note)
    const json = await request.json();
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
    return NextResponse.json({ file: dto }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
