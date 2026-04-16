import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { stopTimer, TimerError } from "@/lib/time/timer";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // body optional
  }

  try {
    const log = await stopTimer({
      userId: session.user.id,
      logId: body.logId ? String(body.logId) : undefined,
      description: body.description ? String(body.description) : undefined,
    });
    if (!log) {
      return NextResponse.json({ data: null });
    }
    return NextResponse.json({ data: log });
  } catch (e) {
    if (e instanceof TimerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[timer/stop]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
