import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import type { TaskViewType } from "@prisma/client";

const ALLOWED_VIEW_TYPES: TaskViewType[] = ["LIST", "KANBAN", "GANTT", "CALENDAR", "PEOPLE"];

const ALLOWED_GROUP_BY = ["status", "priority", "assignee", "stage", "label", "dueDate", null] as const;
const ALLOWED_SORT_BY = [
  "newest", "oldest", "dueAsc", "dueDesc", "priority", "position", "title", null,
] as const;

const filtersJsonSchema = z.object({
  statusId: z.union([z.string(), z.array(z.string())]).optional(),
  priority: z.union([z.string(), z.array(z.string())]).optional(),
  assigneeId: z.union([z.string(), z.array(z.string())]).optional(),
  labelId: z.union([z.string(), z.array(z.string())]).optional(),
  stageId: z.union([z.string(), z.array(z.string())]).optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  search: z.string().optional(),
  isArchived: z.boolean().optional(),
  createdById: z.string().optional(),
  hasDueDate: z.boolean().optional(),
  overdue: z.boolean().optional(),
}).passthrough().optional();

const columnsJsonSchema = z.array(z.string().min(1)).optional();

const savedViewBodySchema = z.object({
  name: z.string().trim().min(1, "name required").max(100),
  viewType: z.enum(["LIST", "KANBAN", "GANTT", "CALENDAR", "PEOPLE"]),
  filtersJson: filtersJsonSchema,
  groupBy: z.enum(["status", "priority", "assignee", "stage", "label", "dueDate"]).nullable().optional(),
  sortBy: z.enum(["newest", "oldest", "dueAsc", "dueDesc", "priority", "position", "title"]).nullable().optional(),
  columnsJson: columnsJsonSchema,
  isShared: z.boolean().optional().default(false),
  version: z.number().int().positive().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const views = await prisma.savedView.findMany({
    where: {
      projectId,
      OR: [{ isShared: true }, { userId: session.user.id }],
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: views });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (!(await isTasksEnabledForProject(projectId))) {
    return NextResponse.json({ error: "Tasks disabled" }, { status: 404 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = savedViewBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid view data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Only managers/admins can create shared views
  if (body.isShared && !ctx.canEditAnyTask) {
    return NextResponse.json({ error: "Not allowed to share view" }, { status: 403 });
  }

  const created = await prisma.savedView.create({
    data: {
      projectId,
      userId: body.isShared ? null : session.user.id,
      name: body.name,
      viewType: body.viewType as TaskViewType,
      filtersJson: body.filtersJson as object | undefined,
      groupBy: body.groupBy ?? null,
      sortBy: body.sortBy ?? null,
      columnsJson: body.columnsJson as object | undefined,
      isShared: body.isShared,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
