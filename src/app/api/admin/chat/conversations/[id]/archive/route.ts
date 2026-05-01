import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { setConversationArchived } from "@/lib/chat/service";

const bodySchema = z.object({ archived: z.boolean() });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
    }
    const result = await setConversationArchived(
      id,
      session.user.id,
      parsed.data.archived,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/conversation/archive] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
