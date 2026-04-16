import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { detachLabel, TaskError } from "@/lib/tasks/service";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; labelId: string }> },
) {
  const { taskId, labelId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    await detachLabel(taskId, labelId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/detachLabel]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
