import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { deleteProjectFile } from "@/lib/projects/files-service";
import { canUploadProjectFiles } from "@/lib/projects/access";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id, fileId } = await ctx.params;
    // Permission to upload implies permission to delete own files; manager
    // roles implicitly may delete others (handled inside files-service).
    const allowed = await canUploadProjectFiles(id, session.user.id);
    if (!allowed) return forbiddenResponse();
    const isAdmin = session.user.role === "SUPER_ADMIN";
    await deleteProjectFile(fileId, session.user.id, isAdmin);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[projects/files/delete] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
