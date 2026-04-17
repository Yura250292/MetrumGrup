import { NextRequest, NextResponse } from "next/server";
import {
  requireStaffAccess,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import {
  markCommentsRead,
  getUnreadCommentCount,
} from "@/lib/comments/service";
import { commentEntityTypeSchema } from "@/lib/schemas/comments";
import { z } from "zod";

const readSchema = z.object({
  entityType: commentEntityTypeSchema,
  entityId: z.string().min(1),
});

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[comments/read] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

/** GET — get unread count for an entity */
export async function GET(request: NextRequest) {
  try {
    const session = await requireStaffAccess();
    const url = new URL(request.url);
    const parsed = readSchema.safeParse({
      entityType: url.searchParams.get("entityType") ?? undefined,
      entityId: url.searchParams.get("entityId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
    }
    const count = await getUnreadCommentCount(
      parsed.data.entityType,
      parsed.data.entityId,
      session.user.id,
    );
    return NextResponse.json({ unreadCount: count });
  } catch (err) {
    return handleError(err);
  }
}

/** POST — mark comments as read for an entity */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffAccess();
    const json = await request.json();
    const parsed = readSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
    }
    await markCommentsRead(
      parsed.data.entityType,
      parsed.data.entityId,
      session.user.id,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
