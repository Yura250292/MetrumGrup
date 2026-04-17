import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { listComments, postComment } from "@/lib/comments/service";

function handleCommentError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  if (message.includes("не знайдено")) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (message.includes("Порожній")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  console.error("[task/comments] error:", err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const items = await listComments("TASK", taskId, session.user.id);
    return NextResponse.json({ data: items });
  } catch (e) {
    return handleCommentError(e);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  try {
    const comment = await postComment("TASK", taskId, session.user.id, body.body);
    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (e) {
    return handleCommentError(e);
  }
}
