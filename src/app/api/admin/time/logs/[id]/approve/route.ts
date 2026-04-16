import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { approveLog, TimerError } from "@/lib/time/timer";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const log = await approveLog({ logId: id, actorId: session.user.id });
    return NextResponse.json({ data: log });
  } catch (e) {
    if (e instanceof TimerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[time/log/approve]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
