import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { ProjectStage, StageStatus } from "@prisma/client";
import { STAGE_ORDER } from "@/lib/constants";

type IncomingStage = {
  id?: string;
  stage: ProjectStage | null;
  customName?: string | null;
  isHidden?: boolean;
  status: StageStatus;
  progress?: number;
  notes?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = (await request.json()) as { stages: IncomingStage[] };
  const incoming = body.stages ?? [];

  const existing = await prisma.projectStageRecord.findMany({
    where: { projectId },
    select: { id: true, _count: { select: { tasks: true } } },
  });

  const incomingIds = new Set(incoming.filter((s) => s.id).map((s) => s.id as string));

  // Deletions: remove records the client no longer included, but only when no tasks reference them.
  // Safety-hide the rest.
  const toHardDelete: string[] = [];
  const toSoftHide: string[] = [];
  for (const row of existing) {
    if (incomingIds.has(row.id)) continue;
    if (row._count.tasks === 0) toHardDelete.push(row.id);
    else toSoftHide.push(row.id);
  }

  await prisma.$transaction(async (tx) => {
    if (toHardDelete.length > 0) {
      await tx.projectStageRecord.deleteMany({
        where: { id: { in: toHardDelete } },
      });
    }
    if (toSoftHide.length > 0) {
      await tx.projectStageRecord.updateMany({
        where: { id: { in: toSoftHide } },
        data: { isHidden: true },
      });
    }

    for (let i = 0; i < incoming.length; i++) {
      const s = incoming[i];
      const data = {
        stage: s.stage ?? null,
        customName: s.customName?.trim() || null,
        isHidden: s.isHidden ?? false,
        status: s.status,
        progress: Math.max(0, Math.min(100, s.progress ?? 0)),
        notes: s.notes?.trim() || null,
        startDate: s.startDate ? new Date(s.startDate) : null,
        endDate: s.endDate ? new Date(s.endDate) : null,
        sortOrder: i,
      };

      if (s.id) {
        await tx.projectStageRecord.update({
          where: { id: s.id },
          data,
        });
      } else {
        await tx.projectStageRecord.create({
          data: { ...data, projectId },
        });
      }
    }
  });

  // Recompute currentStage + currentStageRecordId + overallProgress.
  const fresh = await prisma.projectStageRecord.findMany({
    where: { projectId, isHidden: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true, stage: true, status: true, progress: true },
  });

  let currentRecord = fresh.find((r) => r.status === "IN_PROGRESS");
  if (!currentRecord) {
    const completed = fresh.filter((r) => r.status === "COMPLETED");
    currentRecord = completed[completed.length - 1] ?? fresh[0];
  }

  // Enum fallback for currentStage (legacy column): prefer the record's enum, or the first enum-backed stage in order.
  let currentStage: ProjectStage = "DESIGN";
  if (currentRecord?.stage) {
    currentStage = currentRecord.stage;
  } else {
    for (const enumStage of STAGE_ORDER) {
      if (fresh.some((r) => r.stage === enumStage)) {
        currentStage = enumStage;
        break;
      }
    }
  }

  const totalVisible = fresh.length || 1;
  const completedCount = fresh.filter((r) => r.status === "COMPLETED").length;
  const inProgress = fresh.find((r) => r.status === "IN_PROGRESS");
  const overallProgress = Math.round(
    ((completedCount + (inProgress ? inProgress.progress / 100 : 0)) / totalVisible) * 100,
  );

  await prisma.project.update({
    where: { id: projectId },
    data: {
      currentStage,
      currentStageRecordId: currentRecord?.id ?? null,
      stageProgress: Math.max(0, Math.min(100, overallProgress)),
    },
  });

  return NextResponse.json({ success: true });
}
