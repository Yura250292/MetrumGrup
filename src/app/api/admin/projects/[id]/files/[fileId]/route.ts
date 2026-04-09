import { NextResponse } from "next/server";
import {
  ADMIN_ROLES,
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { deleteProjectFile } from "@/lib/projects/files-service";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { fileId } = await ctx.params;
    const isAdmin = ADMIN_ROLES.includes(session.user.role);
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
