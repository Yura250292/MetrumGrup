import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { removeAssignee, TaskError } from "@/lib/tasks/service";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; userId: string }> },
) {
  const { taskId, userId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    await removeAssignee(taskId, userId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/removeAssignee]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
