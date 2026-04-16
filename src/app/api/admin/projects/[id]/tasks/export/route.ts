import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { searchTasks, TaskError } from "@/lib/tasks/service";
import { STAGE_LABELS } from "@/lib/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();

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

  if (format === "csv") {
    const header = [
      "Title",
      "Status",
      "Priority",
      "Stage",
      "Due",
      "Assignees",
      "Labels",
    ].join(",");
    const lines = rows.map((t) =>
      [
        quoteCsv(t.title),
        quoteCsv(t.status.name),
        t.priority,
        quoteCsv(STAGE_LABELS[t.stage.stage] ?? t.stage.stage),
        t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
        quoteCsv(t.assignees.map((a) => a.user.name).join("; ")),
        quoteCsv(t.labels.map((l) => l.label.name).join("; ")),
      ].join(","),
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
  ws.columns = [
    { header: "Title", key: "title", width: 48 },
    { header: "Status", key: "status", width: 16 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Stage", key: "stage", width: 18 },
    { header: "Due", key: "due", width: 12 },
    { header: "Assignees", key: "assignees", width: 32 },
    { header: "Labels", key: "labels", width: 32 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const t of rows) {
    ws.addRow({
      title: t.title,
      status: t.status.name,
      priority: t.priority,
      stage: STAGE_LABELS[t.stage.stage] ?? t.stage.stage,
      due: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
      assignees: t.assignees.map((a) => a.user.name).join(", "),
      labels: t.labels.map((l) => l.label.name).join(", "),
    });
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
