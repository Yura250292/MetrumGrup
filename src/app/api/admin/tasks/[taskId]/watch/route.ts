import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { TaskError, toggleWatcher } from "@/lib/tasks/service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const watching = await toggleWatcher(taskId, session.user.id);
    return NextResponse.json({ data: { watching } });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/toggleWatcher]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
