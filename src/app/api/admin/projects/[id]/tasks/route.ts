import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import {
  createTask,
  listTasks,
  TaskError,
  type ListFilter,
} from "@/lib/tasks/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const url = new URL(request.url);
  const q = url.searchParams;
  const filter: ListFilter = {
    projectId,
    stageId: q.get("stageId") || undefined,
    statusId: q.get("statusId") || undefined,
    assigneeId: q.get("assigneeId") || undefined,
    labelId: q.get("labelId") || undefined,
    priority:
      (q.get("priority") as ListFilter["priority"] | null) || undefined,
    parentTaskId:
      q.get("parentTaskId") === "root"
        ? null
        : q.get("parentTaskId") || undefined,
    search: q.get("search") || undefined,
    includeArchived: q.get("includeArchived") === "true",
    cursor: q.get("cursor") || undefined,
    take: q.get("take") ? Number(q.get("take")) : undefined,
  };

  try {
    const result = await listTasks(filter, session.user.id);
    return NextResponse.json({ data: result });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tasks/list]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

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

  try {
    const task = await createTask(
      {
        projectId,
        stageId: String(body.stageId ?? ""),
        parentTaskId: body.parentTaskId ? String(body.parentTaskId) : undefined,
        title: String(body.title ?? ""),
        description: body.description ? String(body.description) : undefined,
        priority:
          (body.priority as
            | "LOW"
            | "NORMAL"
            | "HIGH"
            | "URGENT"
            | undefined) ?? undefined,
        statusId: body.statusId ? String(body.statusId) : undefined,
        startDate: body.startDate ? new Date(String(body.startDate)) : undefined,
        dueDate: body.dueDate ? new Date(String(body.dueDate)) : undefined,
        estimatedHours:
          body.estimatedHours === null || body.estimatedHours === undefined
            ? undefined
            : Number(body.estimatedHours),
        isPrivate: Boolean(body.isPrivate),
        assigneeIds: Array.isArray(body.assigneeIds)
          ? (body.assigneeIds as unknown[]).map((v) => String(v))
          : undefined,
        labelIds: Array.isArray(body.labelIds)
          ? (body.labelIds as unknown[]).map((v) => String(v))
          : undefined,
      },
      session.user.id,
    );
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tasks/create]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
