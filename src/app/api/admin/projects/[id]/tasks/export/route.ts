import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { searchTasks, TaskError } from "@/lib/tasks/service";
import { getProjectAccessContext } from "@/lib/projects/access";
import { prisma } from "@/lib/prisma";
import { stageDisplayName } from "@/lib/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();

  // Load access context for role-aware masking
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rows;
  try {
    rows = await searchTasks(projectId, {}, "dueAsc", session.user.id, 500);
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tasks/export]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // Enrich with checklist, dependencies, time metrics
  const taskIds = rows.map((r) => r.id);

  const [checklists, outDeps, inDeps, timeLogs] = await Promise.all([
    prisma.checklistItem.findMany({
      where: { taskId: { in: taskIds } },
      select: { taskId: true, isDone: true },
    }),
    prisma.taskDependency.findMany({
      where: { predecessorId: { in: taskIds } },
      select: { predecessorId: true, successor: { select: { title: true } } },
    }),
    prisma.taskDependency.findMany({
      where: { successorId: { in: taskIds } },
      select: { successorId: true, predecessor: { select: { title: true } } },
    }),
    ctx.canViewTimeReports
      ? prisma.timeLog.groupBy({
          by: ["taskId"],
          where: { taskId: { in: taskIds }, endedAt: { not: null } },
          _sum: { minutes: true, costSnapshot: true },
        })
      : Promise.resolve([]),
  ]);

  // Build lookup maps
  const checklistMap = new Map<string, { total: number; done: number }>();
  for (const c of checklists) {
    const entry = checklistMap.get(c.taskId) ?? { total: 0, done: 0 };
    entry.total++;
    if (c.isDone) entry.done++;
    checklistMap.set(c.taskId, entry);
  }

  const outDepsMap = new Map<string, string[]>();
  for (const d of outDeps) {
    const arr = outDepsMap.get(d.predecessorId) ?? [];
    arr.push(d.successor.title);
    outDepsMap.set(d.predecessorId, arr);
  }

  const inDepsMap = new Map<string, string[]>();
  for (const d of inDeps) {
    const arr = inDepsMap.get(d.successorId) ?? [];
    arr.push(d.predecessor.title);
    inDepsMap.set(d.successorId, arr);
  }

  const timeMap = new Map<string, { minutes: number; cost: number | null }>();
  for (const t of timeLogs) {
    timeMap.set(t.taskId, {
      minutes: t._sum.minutes ?? 0,
      cost: ctx.canViewCostReports ? (t._sum.costSnapshot as number | null) : null,
    });
  }

  // Build export rows
  type ExportRow = {
    title: string;
    status: string;
    priority: string;
    stage: string;
    startDate: string;
    due: string;
    assignees: string;
    labels: string;
    checklist: string;
    blockedBy: string;
    blocks: string;
    estimatedHours: string;
    loggedMinutes: string;
    cost: string;
    customFields: string;
  };

  const exportRows: ExportRow[] = rows.map((t) => {
    const cl = checklistMap.get(t.id);
    const tm = timeMap.get(t.id);
    const cf = (t as Record<string, unknown>).customFields;

    return {
      title: t.title,
      status: t.status.name,
      priority: t.priority,
      stage: stageDisplayName({ stage: t.stage.stage, customName: (t.stage as any).customName ?? null }),
      startDate: t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : "",
      due: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
      assignees: t.assignees.map((a) => a.user.name).join("; "),
      labels: t.labels.map((l) => l.label.name).join("; "),
      checklist: cl ? `${cl.done}/${cl.total}` : "",
      blockedBy: (inDepsMap.get(t.id) ?? []).join("; "),
      blocks: (outDepsMap.get(t.id) ?? []).join("; "),
      estimatedHours: t.estimatedHours != null ? String(t.estimatedHours) : "",
      loggedMinutes: ctx.canViewTimeReports && tm ? String(tm.minutes) : "",
      cost: ctx.canViewCostReports && tm?.cost != null ? tm.cost.toFixed(2) : "",
      customFields: cf && typeof cf === "object" ? JSON.stringify(cf) : "",
    };
  });

  // Build columns — exclude time/cost columns if user lacks permissions
  const baseHeaders = [
    "Title", "Status", "Priority", "Stage", "Start Date", "Due",
    "Assignees", "Labels", "Checklist", "Blocked By", "Blocks",
    "Estimated Hours",
  ];
  const baseKeys: (keyof ExportRow)[] = [
    "title", "status", "priority", "stage", "startDate", "due",
    "assignees", "labels", "checklist", "blockedBy", "blocks",
    "estimatedHours",
  ];

  if (ctx.canViewTimeReports) {
    baseHeaders.push("Logged Minutes");
    baseKeys.push("loggedMinutes");
  }
  if (ctx.canViewCostReports) {
    baseHeaders.push("Cost");
    baseKeys.push("cost");
  }
  baseHeaders.push("Custom Fields");
  baseKeys.push("customFields");

  if (format === "csv") {
    const header = baseHeaders.join(",");
    const lines = exportRows.map((r) =>
      baseKeys.map((k) => quoteCsv(r[k])).join(","),
    );
    const csv = [header, ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tasks-${projectId}.csv"`,
      },
    });
  }

  // XLSX
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tasks");
  ws.columns = baseHeaders.map((header, i) => ({
    header,
    key: baseKeys[i]!,
    width: header === "Title" ? 48 : header === "Custom Fields" ? 40 : 18,
  }));
  ws.getRow(1).font = { bold: true };

  for (const r of exportRows) {
    const row: Record<string, string> = {};
    for (const k of baseKeys) row[k] = r[k];
    ws.addRow(row);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tasks-${projectId}.xlsx"`,
    },
  });
}

function quoteCsv(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
