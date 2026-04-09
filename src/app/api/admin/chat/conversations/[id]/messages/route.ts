import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { getMessages, postMessage } from "@/lib/chat/service";
import { messageQuerySchema, postMessageSchema } from "@/lib/schemas/chat";

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[chat/messages] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const parsed = messageQuerySchema.safeParse({
      before: url.searchParams.get("before") ?? undefined,
      after: url.searchParams.get("after") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
    }
    const result = await getMessages(id, session.user.id, parsed.data);
    return NextResponse.json(result);
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
    const json = await request.json();
    const parsed = postMessageSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Невірні дані", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const message = await postMessage(id, session.user.id, parsed.data.body);
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
