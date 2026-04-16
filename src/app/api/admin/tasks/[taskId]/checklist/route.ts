import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { addChecklistItem, TaskError } from "@/lib/tasks/service";

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

  try {
    const item = await addChecklistItem(
      taskId,
      {
        content: String(body.content ?? ""),
        position: body.position === undefined ? undefined : Number(body.position),
        dueDate: body.dueDate ? new Date(String(body.dueDate)) : null,
        assigneeId: body.assigneeId ? String(body.assigneeId) : null,
      },
      session.user.id,
    );
    return NextResponse.json({ data: item }, { status: 201 });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/checklist/add]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
