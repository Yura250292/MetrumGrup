import { NextRequest, NextResponse } from "next/server";
import {
  requireStaffAccess,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { listComments, postComment } from "@/lib/comments/service";
import { listCommentsQuerySchema, postCommentSchema } from "@/lib/schemas/comments";

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[comments] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaffAccess();
    const url = new URL(request.url);
    const parsed = listCommentsQuerySchema.safeParse({
      entityType: url.searchParams.get("entityType") ?? undefined,
      entityId: url.searchParams.get("entityId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
    }
    const comments = await listComments(parsed.data.entityType, parsed.data.entityId, session.user.id);
    return NextResponse.json({ data: comments });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffAccess();
    const json = await request.json();
    const parsed = postCommentSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Невірні дані", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const comment = await postComment(
      parsed.data.entityType,
      parsed.data.entityId,
      session.user.id,
      parsed.data.body
    );
    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
