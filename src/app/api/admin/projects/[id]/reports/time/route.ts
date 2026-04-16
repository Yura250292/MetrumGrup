import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import { timeReport } from "@/lib/time/reports";

export async function GET(
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
  if (!ctx?.canViewTimeReports) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : undefined;
  const to = url.searchParams.get("to")
    ? new Date(url.searchParams.get("to")!)
    : undefined;

  const report = await timeReport(
    projectId,
    from && to ? { from, to } : undefined,
  );

  // Strip cost data if user can't view cost reports
  if (!ctx.canViewCostReports) {
    report.totals.cost = 0;
    report.totals.billableCost = 0;
    report.byUser = report.byUser.map((r) => ({ ...r, cost: 0 }));
    report.byTask = report.byTask.map((r) => ({ ...r, cost: 0 }));
  }

  return NextResponse.json({ data: report });
}
