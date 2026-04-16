import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { deleteLog, TimerError } from "@/lib/time/timer";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    await deleteLog({ logId: id, actorId: session.user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TimerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[time/log/delete]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
