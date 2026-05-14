import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { addAssignee, TaskError } from "@/lib/tasks/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: { userId?: unknown; employeeId?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Polymorphic ref: підтримуємо обидва формати — legacy `{ userId }` та
  // новий `{ kind: "user"|"employee", id }` (передається як userId/employeeId).
  let ref: { kind: "user" | "employee"; id: string };
  if (typeof body.employeeId === "string" && body.employeeId) {
    ref = { kind: "employee", id: body.employeeId };
  } else if (typeof body.userId === "string" && body.userId) {
    ref = { kind: "user", id: body.userId };
  } else {
    return NextResponse.json(
      { error: "userId або employeeId є обовʼязковим" },
      { status: 400 },
    );
  }

  try {
    await addAssignee(taskId, ref, session.user.id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/addAssignee]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
