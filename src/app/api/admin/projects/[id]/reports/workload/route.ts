import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import { workloadReport } from "@/lib/time/reports";

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

  const data = await workloadReport(
    projectId,
    from && to ? { from, to } : undefined,
  );
  return NextResponse.json({ data });
}
