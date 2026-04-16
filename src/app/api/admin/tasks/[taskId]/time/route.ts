import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { createManualLog, listTaskLogs, TimerError } from "@/lib/time/timer";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const logs = await listTaskLogs(taskId, session.user.id);
    return NextResponse.json({ data: logs });
  } catch (e) {
    if (e instanceof TimerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/time/list]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

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

  const startedAt = body.startedAt ? new Date(String(body.startedAt)) : null;
  const endedAt = body.endedAt ? new Date(String(body.endedAt)) : null;
  if (!startedAt || !endedAt || Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return NextResponse.json(
      { error: "startedAt and endedAt required" },
      { status: 400 },
    );
  }

  try {
    const log = await createManualLog({
      taskId,
      userId: body.userId ? String(body.userId) : session.user.id,
      startedAt,
      endedAt,
      description: body.description ? String(body.description) : undefined,
      billable: body.billable === undefined ? undefined : Boolean(body.billable),
      actorId: session.user.id,
    });
    return NextResponse.json({ data: log }, { status: 201 });
  } catch (e) {
    if (e instanceof TimerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/time/create]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
