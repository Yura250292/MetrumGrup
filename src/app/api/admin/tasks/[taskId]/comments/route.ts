import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { listComments, postComment } from "@/lib/comments/service";

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
    const msg = e instanceof Error ? e.message : "Internal error";
    const status = msg === "Forbidden" ? 403 : msg.includes("не знайдено") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
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
  if (typeof body.body !== "string") {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  try {
    const comment = await postComment("TASK", taskId, session.user.id, body.body);
    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    const status =
      msg === "Forbidden" ? 403 :
      msg.includes("не знайдено") ? 404 :
      msg.includes("Порожній") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
