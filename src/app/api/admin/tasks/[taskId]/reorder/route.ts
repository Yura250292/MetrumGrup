import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { reorderTask, TaskError } from "@/lib/tasks/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const statusId = String(body.statusId ?? "");
  const position = Number(body.position ?? NaN);
  if (!statusId || !Number.isFinite(position)) {
    return NextResponse.json(
      { error: "statusId and numeric position required" },
      { status: 400 },
    );
  }

  try {
    await reorderTask(taskId, statusId, position, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/reorder]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
