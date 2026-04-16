import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import {
  archiveTask,
  getTask,
  TaskError,
  updateTask,
  type UpdateInput,
} from "@/lib/tasks/service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const task = await getTask(taskId, session.user.id);
    return NextResponse.json({ data: task });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/get]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
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

  const patch: UpdateInput = {};
  if (body.title !== undefined) patch.title = String(body.title);
  if (body.description !== undefined) {
    patch.description = body.description === null ? null : String(body.description);
  }
  if (body.priority !== undefined) {
    patch.priority = body.priority as UpdateInput["priority"];
  }
  if (body.statusId !== undefined) patch.statusId = String(body.statusId);
  if (body.stageId !== undefined) patch.stageId = String(body.stageId);
  if (body.parentTaskId !== undefined) {
    patch.parentTaskId = body.parentTaskId ? String(body.parentTaskId) : null;
  }
  if (body.startDate !== undefined) {
    patch.startDate = body.startDate ? new Date(String(body.startDate)) : null;
  }
  if (body.dueDate !== undefined) {
    patch.dueDate = body.dueDate ? new Date(String(body.dueDate)) : null;
  }
  if (body.estimatedHours !== undefined) {
    patch.estimatedHours =
      body.estimatedHours === null ? null : Number(body.estimatedHours);
  }
  if (body.isPrivate !== undefined) patch.isPrivate = Boolean(body.isPrivate);
  if (body.position !== undefined) patch.position = Number(body.position);
  if (body.customFields !== undefined) {
    patch.customFields =
      body.customFields === null
        ? null
        : (body.customFields as Record<string, unknown>);
  }

  try {
    const task = await updateTask(taskId, patch, session.user.id);
    return NextResponse.json({ data: task });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/update]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    await archiveTask(taskId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[task/archive]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
