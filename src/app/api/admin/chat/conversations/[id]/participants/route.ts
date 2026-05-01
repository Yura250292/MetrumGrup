import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { addGroupParticipants } from "@/lib/chat/service";

const bodySchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "Виберіть хоча б одного користувача"),
});

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
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Невірний запит" },
        { status: 400 },
      );
    }
    const result = await addGroupParticipants(
      id,
      session.user.id,
      parsed.data.userIds,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    if (message === "Розмову не знайдено") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("[chat/conversation/participants] add error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
