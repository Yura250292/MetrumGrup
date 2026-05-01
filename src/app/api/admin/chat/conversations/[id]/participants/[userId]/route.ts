import { NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { removeGroupParticipant } from "@/lib/chat/service";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id, userId } = await ctx.params;
    const result = await removeGroupParticipant(id, session.user.id, userId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    if (message === "Розмову не знайдено") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("[chat/conversation/participants] remove error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
