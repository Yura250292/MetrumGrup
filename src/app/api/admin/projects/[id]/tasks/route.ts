import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewFinance, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  addChecklistItem,
  createTask,
  listTasks,
  TaskError,
  type AssigneeInput,
  type ListFilter,
} from "@/lib/tasks/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // RBAC: цифри витрат бачить ЛИШЕ фінанс-роль (SUPER_ADMIN). Клієнт може
  // попросити cost (?withCost=1), але числа долучаються лише коли дозволено.
  const wantsCost = new URL(request.url).searchParams.get("withCost") === "1";
  const includeCost = wantsCost && canViewFinance(session.user.role);

  const url = new URL(request.url);
  const q = url.searchParams;
  const filter: ListFilter = {
    projectId,
    includeCost,
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

  // Resolve stage: explicit `stageId` або дефолтна (перша top-level) проєкту.
  let stageId = body.stageId ? String(body.stageId) : "";
  if (!stageId) {
    const stage = await prisma.projectStageRecord.findFirst({
      where: { projectId, parentStageId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (!stage) {
      return NextResponse.json(
        { error: "У проєкті немає жодної стадії" },
        { status: 400 },
      );
    }
    stageId = stage.id;
  }

  // Мерджимо новий `assignees[]` шейп з legacy `assigneeIds[]` для зворотньої
  // сумісності — service.createTask нормалізує обидва формати.
  const assignees: AssigneeInput[] = Array.isArray(body.assignees)
    ? (body.assignees as unknown[]).flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const o = raw as Record<string, unknown>;
        if (o.userId) return [{ userId: String(o.userId) } as AssigneeInput];
        if (o.externalName) {
          return [{ externalName: String(o.externalName) } as AssigneeInput];
        }
        return [];
      })
    : [];

  // Запис cost-полів — лише фінанс-роль.
  const canWriteCost = canViewFinance(session.user.role);

  try {
    const task = await createTask(
      {
        projectId,
        stageId,
        sourceEstimateItemId:
          canWriteCost && body.sourceEstimateItemId
            ? String(body.sourceEstimateItemId)
            : undefined,
        plannedCostManual:
          canWriteCost && body.plannedCostManual != null
            ? Number(body.plannedCostManual)
            : undefined,
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
        assignees: assignees.length > 0 ? assignees : undefined,
        assigneeIds: Array.isArray(body.assigneeIds)
          ? (body.assigneeIds as unknown[]).map((v) => String(v))
          : undefined,
        labelIds: Array.isArray(body.labelIds)
          ? (body.labelIds as unknown[]).map((v) => String(v))
          : undefined,
      },
      session.user.id,
    );

    // Optional AI-generated checklist — best-effort, do not fail the create.
    if (Array.isArray(body.checklist) && body.checklist.length > 0) {
      for (const raw of body.checklist as unknown[]) {
        const content = String(raw).trim();
        if (!content) continue;
        try {
          await addChecklistItem(
            task.id,
            { content: content.slice(0, 500) },
            session.user.id,
          );
        } catch (err) {
          console.error("[tasks/create] checklist item failed:", err);
        }
      }
    }

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tasks/create]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
