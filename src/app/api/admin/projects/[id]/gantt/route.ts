import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { getProjectAccessContext } from "@/lib/projects/access";
import { getGanttData } from "@/lib/tasks/dependencies";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

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

  const data = await getGanttData(projectId);
  return NextResponse.json({ data });
}
