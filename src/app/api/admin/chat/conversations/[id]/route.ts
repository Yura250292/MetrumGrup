import { NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { getConversation } from "@/lib/chat/service";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const conversation = await getConversation(id, session.user.id);
    if (!conversation) {
      return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/conversation] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
