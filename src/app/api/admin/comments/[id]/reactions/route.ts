import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { toggleCommentReaction } from "@/lib/comments/service";
import { reactionSchema } from "@/lib/schemas/comments";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const json = await request.json();
    const parsed = reactionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Невідома реакція" }, { status: 400 });
    }
    const reactions = await toggleCommentReaction(id, session.user.id, parsed.data.emoji);
    return NextResponse.json({ reactions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[comments/reactions] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
