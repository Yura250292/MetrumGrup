import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { ProjectStage, StageStatus } from "@prisma/client";

const STAGE_ORDER: ProjectStage[] = [
  "DESIGN", "FOUNDATION", "WALLS", "ROOF", "ENGINEERING", "FINISHING", "HANDOVER",
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const { stages } = await request.json();

  // Update each stage
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const stage = s.stage as ProjectStage;

    await prisma.projectStageRecord.upsert({
      where: {
        projectId_stage: { projectId, stage },
      },
      create: {
        projectId,
        stage,
        status: s.status as StageStatus,
        progress: s.progress || 0,
        notes: s.notes || null,
        startDate: s.startDate ? new Date(s.startDate) : null,
        endDate: s.endDate ? new Date(s.endDate) : null,
        sortOrder: i,
      },
      update: {
        status: s.status as StageStatus,
        progress: s.progress || 0,
        notes: s.notes || null,
        startDate: s.startDate ? new Date(s.startDate) : null,
        endDate: s.endDate ? new Date(s.endDate) : null,
        sortOrder: i,
      },
    });
  }

  // Determine current stage and overall progress
  let currentStage: ProjectStage = "DESIGN";
  let overallProgress = 0;

  for (const stage of STAGE_ORDER) {
    const s = stages.find((st: { stage: string }) => st.stage === stage);
    if (s?.status === "IN_PROGRESS") {
      currentStage = stage;
      break;
    }
    if (s?.status === "COMPLETED") {
      currentStage = stage;
    }
  }

  // Calculate overall progress
  const completedCount = stages.filter((s: { status: string }) => s.status === "COMPLETED").length;
  const inProgressStage = stages.find((s: { status: string }) => s.status === "IN_PROGRESS");
  overallProgress = Math.round(
    ((completedCount + (inProgressStage ? (inProgressStage.progress / 100) : 0)) / stages.length) * 100
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage, stageProgress: overallProgress },
  });

  return NextResponse.json({ success: true });
}
