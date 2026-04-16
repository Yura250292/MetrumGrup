import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { startTimer, TimerError } from "@/lib/time/timer";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = String(body.taskId ?? "");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  try {
    const log = await startTimer({
      userId: session.user.id,
      taskId,
      description: body.description ? String(body.description) : undefined,
      billable: body.billable === undefined ? undefined : Boolean(body.billable),
    });
    return NextResponse.json({ data: log }, { status: 201 });
  } catch (e) {
    if (e instanceof TimerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[timer/start]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
