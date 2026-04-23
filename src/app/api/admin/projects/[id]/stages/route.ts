import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { ProjectStage, StageStatus } from "@prisma/client";
import { STAGE_ORDER } from "@/lib/constants";

const MAX_DEPTH = 2; // 0-indexed: root=0, підетап=1, підпідетап=2 (3 рівні)

type IncomingStage = {
  id?: string;
  clientKey: string;
  stage: ProjectStage | null;
  customName?: string | null;
  isHidden?: boolean;
  status: StageStatus;
  progress?: number;
  notes?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  responsibleUserId?: string | null;
  allocatedBudget?: number | null;
  children?: IncomingStage[];
};

type FlatNode = {
  node: IncomingStage;
  parentClientKey: string | null;
  depth: number;
  sortOrder: number;
};

function flattenTree(stages: IncomingStage[]): { flat: FlatNode[]; error?: string } {
  const flat: FlatNode[] = [];
  const keySeen = new Set<string>();
  let err: string | undefined;

  function walk(nodes: IncomingStage[], parentKey: string | null, depth: number) {
    if (err) return;
    if (depth > MAX_DEPTH) {
      err = `Перевищено максимальну глибину вкладення (${MAX_DEPTH + 1} рівнів)`;
      return;
    }
    nodes.forEach((node, idx) => {
      if (!node.clientKey) {
        err = "Відсутній clientKey у вузлі";
        return;
      }
      if (keySeen.has(node.clientKey)) {
        err = `Дубльований clientKey: ${node.clientKey}`;
        return;
      }
      keySeen.add(node.clientKey);
      flat.push({ node, parentClientKey: parentKey, depth, sortOrder: idx });
      if (node.children?.length) walk(node.children, node.clientKey, depth + 1);
    });
  }

  walk(stages, null, 0);
  return { flat, error: err };
}

async function collectDescendantIds(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  rootIds: string[],
): Promise<string[]> {
  const all = new Set<string>(rootIds);
  let frontier = rootIds;
  while (frontier.length > 0) {
    const children = await tx.projectStageRecord.findMany({
      where: { parentStageId: { in: frontier } },
      select: { id: true },
    });
    const nextIds = children.map((c) => c.id).filter((id) => !all.has(id));
    nextIds.forEach((id) => all.add(id));
    frontier = nextIds;
  }
  return [...all];
}

async function hasAnyTasksInSubtree(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  subtreeIds: string[],
): Promise<boolean> {
  if (subtreeIds.length === 0) return false;
  const count = await tx.task.count({
    where: { stageId: { in: subtreeIds } },
  });
  return count > 0;
}

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

  const { flat, error: flattenErr } = flattenTree(incoming);
  if (flattenErr) {
    return NextResponse.json({ error: flattenErr }, { status: 400 });
  }

  const existing = await prisma.projectStageRecord.findMany({
    where: { projectId },
    select: { id: true, parentStageId: true },
  });

  const incomingIds = new Set(
    flat.map((f) => f.node.id).filter((id): id is string => Boolean(id)),
  );

  const removedRootIds = existing
    .filter((r) => !incomingIds.has(r.id))
    .filter((r) => !r.parentStageId || !existing.some((e) => e.id === r.parentStageId && !incomingIds.has(e.id)))
    .map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    if (removedRootIds.length > 0) {
      const subtree = await collectDescendantIds(tx, removedRootIds);
      const hasTasks = await hasAnyTasksInSubtree(tx, subtree);
      if (hasTasks) {
        await tx.projectStageRecord.updateMany({
          where: { id: { in: subtree } },
          data: { isHidden: true },
        });
      } else {
        await tx.projectStageRecord.deleteMany({
          where: { id: { in: removedRootIds } },
        });
      }
    }

    // Pass A: create/update всі ноди з parentStageId: null (resolvення parent'а — пізніше)
    const keyToId = new Map<string, string>();
    for (const f of flat) {
      const s = f.node;
      const data = {
        stage: s.stage ?? null,
        customName: s.customName?.trim() || null,
        isHidden: s.isHidden ?? false,
        status: s.status,
        progress: Math.max(0, Math.min(100, s.progress ?? 0)),
        notes: s.notes?.trim() || null,
        startDate: s.startDate ? new Date(s.startDate) : null,
        endDate: s.endDate ? new Date(s.endDate) : null,
        responsibleUserId: s.responsibleUserId || null,
        allocatedBudget:
          s.allocatedBudget !== null && s.allocatedBudget !== undefined
            ? s.allocatedBudget
            : null,
        sortOrder: f.sortOrder,
      };

      if (s.id) {
        await tx.projectStageRecord.update({
          where: { id: s.id },
          data: { ...data, parentStageId: null },
        });
        keyToId.set(s.clientKey, s.id);
      } else {
        const created = await tx.projectStageRecord.create({
          data: { ...data, parentStageId: null, projectId },
        });
        keyToId.set(s.clientKey, created.id);
      }
    }

    // Pass B: прив'язати parentStageId
    for (const f of flat) {
      if (!f.parentClientKey) continue;
      const childId = keyToId.get(f.node.clientKey);
      const parentId = keyToId.get(f.parentClientKey);
      if (!childId || !parentId) continue;
      await tx.projectStageRecord.update({
        where: { id: childId },
        data: { parentStageId: parentId },
      });
    }
  });

  // Recompute currentStage + currentStageRecordId + overallProgress — лише по top-level.
  const topLevel = await prisma.projectStageRecord.findMany({
    where: { projectId, isHidden: false, parentStageId: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, stage: true, status: true, progress: true },
  });

  let currentRecord = topLevel.find((r) => r.status === "IN_PROGRESS");
  if (!currentRecord) {
    const completed = topLevel.filter((r) => r.status === "COMPLETED");
    currentRecord = completed[completed.length - 1] ?? topLevel[0];
  }

  let currentStage: ProjectStage = "DESIGN";
  if (currentRecord?.stage) {
    currentStage = currentRecord.stage;
  } else {
    for (const enumStage of STAGE_ORDER) {
      if (topLevel.some((r) => r.stage === enumStage)) {
        currentStage = enumStage;
        break;
      }
    }
  }

  const totalVisible = topLevel.length || 1;
  const completedCount = topLevel.filter((r) => r.status === "COMPLETED").length;
  const inProgress = topLevel.find((r) => r.status === "IN_PROGRESS");
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
