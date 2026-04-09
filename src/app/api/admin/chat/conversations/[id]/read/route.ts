import { NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { markRead } from "@/lib/chat/service";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    await markRead(id, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/read] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
