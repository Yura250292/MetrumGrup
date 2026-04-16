import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import {
  removeChecklistItem,
  TaskError,
  toggleChecklistItem,
} from "@/lib/tasks/service";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; itemId: string }> },
) {
  const { taskId, itemId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const item = await toggleChecklistItem(taskId, itemId, session.user.id);
    return NextResponse.json({ data: item });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/checklist/toggle]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; itemId: string }> },
) {
  const { taskId, itemId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    await removeChecklistItem(taskId, itemId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/checklist/remove]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
