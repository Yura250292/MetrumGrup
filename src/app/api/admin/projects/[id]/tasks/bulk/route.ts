import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import {
  bulkArchive,
  bulkAssign,
  bulkUpdateStatus,
  TaskError,
} from "@/lib/tasks/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const taskIds = Array.isArray(body.taskIds)
    ? (body.taskIds as unknown[]).map((v) => String(v))
    : [];
  if (taskIds.length === 0) {
    return NextResponse.json({ error: "taskIds required" }, { status: 400 });
  }

  try {
    if (action === "setStatus") {
      const statusId = String(body.statusId ?? "");
      if (!statusId) return NextResponse.json({ error: "statusId required" }, { status: 400 });
      await bulkUpdateStatus(projectId, taskIds, statusId, session.user.id);
    } else if (action === "archive") {
      await bulkArchive(projectId, taskIds, session.user.id);
    } else if (action === "assign") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      const employeeId =
        typeof body.employeeId === "string" ? body.employeeId : "";
      const ref: { kind: "user" | "employee"; id: string } | null = employeeId
        ? { kind: "employee", id: employeeId }
        : userId
          ? { kind: "user", id: userId }
          : null;
      if (!ref)
        return NextResponse.json(
          { error: "userId або employeeId є обовʼязковим" },
          { status: 400 },
        );
      await bulkAssign(projectId, taskIds, ref, session.user.id);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tasks/bulk]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
