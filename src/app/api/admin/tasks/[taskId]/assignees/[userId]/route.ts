import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { removeAssignee, TaskError } from "@/lib/tasks/service";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string; userId: string }> },
) {
  const { taskId, userId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // [userId] у URL зберігаємо для BC, але це може бути або User.id, або
  // Employee.id. Розрізняємо за ?kind=employee.
  const kindParam = request.nextUrl.searchParams.get("kind");
  const ref: { kind: "user" | "employee"; id: string } =
    kindParam === "employee"
      ? { kind: "employee", id: userId }
      : { kind: "user", id: userId };

  try {
    await removeAssignee(taskId, ref, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/removeAssignee]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
