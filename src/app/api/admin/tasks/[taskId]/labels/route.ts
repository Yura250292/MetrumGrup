import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { attachLabel, TaskError } from "@/lib/tasks/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: { labelId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.labelId !== "string" || !body.labelId) {
    return NextResponse.json({ error: "labelId required" }, { status: 400 });
  }

  try {
    await attachLabel(taskId, body.labelId, session.user.id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/attachLabel]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
