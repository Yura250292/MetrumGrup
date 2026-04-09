import { NextResponse } from "next/server";
import {
  ADMIN_ROLES,
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { deleteComment } from "@/lib/comments/service";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const isAdmin = ADMIN_ROLES.includes(session.user.role);
    await deleteComment(id, session.user.id, isAdmin);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[comments/delete] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
