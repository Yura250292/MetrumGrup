import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { getOrCreateDefaultStatus } from "@/lib/tasks/defaults";
import { applyTaskTemplate } from "@/lib/tasks/templates";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const projectId = String(body.projectId ?? "");
  const stageId = String(body.stageId ?? "");
  const parentTaskId = body.parentTaskId ? String(body.parentTaskId) : null;
  const statusId = body.statusId ? String(body.statusId) : null;

  if (!projectId || !stageId) {
    return NextResponse.json({ error: "projectId and stageId required" }, { status: 400 });
  }
  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canCreateTasks) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stage = await prisma.projectStageRecord.findFirst({
    where: { id: stageId, projectId },
  });
  if (!stage) {
    return NextResponse.json({ error: "Stage not in this project" }, { status: 400 });
  }

  const status = statusId
    ? await prisma.taskStatus.findFirst({ where: { id: statusId, projectId } })
    : await getOrCreateDefaultStatus(projectId);
  if (!status) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const rootId = await applyTaskTemplate(
      templateId,
      {
        projectId,
        stageId,
        statusId: status.id,
        createdById: session.user.id,
      },
      parentTaskId,
    );
    return NextResponse.json({ data: { rootId } }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
