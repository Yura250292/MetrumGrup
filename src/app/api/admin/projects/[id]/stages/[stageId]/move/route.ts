import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { recalcCurrentStage } from "@/lib/projects/stages-helpers";
import { assertCanAccessFirm } from "@/lib/firm/scope";

const MAX_DEPTH = 2;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const { id: projectId, stageId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = (await request.json()) as {
    parentStageId?: string | null;
    sortOrder?: number;
  };
  const newParentId = body.parentStageId ?? null;
  const newSortOrderRaw = Number(body.sortOrder ?? 0);
  if (!Number.isFinite(newSortOrderRaw) || newSortOrderRaw < 0) {
    return NextResponse.json({ error: "Невалідний sortOrder" }, { status: 400 });
  }
  const newSortOrder = Math.floor(newSortOrderRaw);

  const stage = await prisma.projectStageRecord.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      projectId: true,
      parentStageId: true,
      sortOrder: true,
      project: { select: { firmId: true } },
    },
  });
  if (!stage || stage.projectId !== projectId) {
    return NextResponse.json({ error: "Етап не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, stage.project.firmId);
  } catch {
    return forbiddenResponse();
  }

  if (newParentId === stageId) {
    return NextResponse.json(
      { error: "Не можна перенести етап у самого себе" },
      { status: 400 },
    );
  }

  // Усі стейджі цього проєкту — для перевірок глибини, циклу і renumber.
  const all = await prisma.projectStageRecord.findMany({
    where: { projectId },
    select: { id: true, parentStageId: true, sortOrder: true },
  });
  const byId = new Map(all.map((s) => [s.id, s]));

  if (newParentId !== null && !byId.has(newParentId)) {
    return NextResponse.json(
      { error: "Цільового батька не знайдено в проєкті" },
      { status: 400 },
    );
  }

  // Cycle check: newParentId не може бути нащадком stageId.
  if (newParentId !== null) {
    let cursor: string | null = newParentId;
    const guard = new Set<string>();
    while (cursor) {
      if (cursor === stageId) {
        return NextResponse.json(
          { error: "Не можна перенести етап у власного нащадка" },
          { status: 400 },
        );
      }
      if (guard.has(cursor)) break;
      guard.add(cursor);
      cursor = byId.get(cursor)?.parentStageId ?? null;
    }
  }

  // Depth check: depth(newParent) + 1 + maxDescendantDepth(stage) <= MAX_DEPTH.
  const depthOf = (id: string | null): number => {
    if (!id) return -1; // null = "корінь", child буде на depth 0
    let d = 0;
    let cursor: string | null = id;
    const guard = new Set<string>();
    while (cursor) {
      if (guard.has(cursor)) break;
      guard.add(cursor);
      const node = byId.get(cursor);
      if (!node || !node.parentStageId) return d;
      d += 1;
      cursor = node.parentStageId;
    }
    return d;
  };

  const childrenOf = new Map<string | null, string[]>();
  for (const s of all) {
    const arr = childrenOf.get(s.parentStageId) ?? [];
    arr.push(s.id);
    childrenOf.set(s.parentStageId, arr);
  }
  const subtreeMaxDepth = (rootId: string): number => {
    let max = 0;
    const walk = (id: string, d: number) => {
      max = Math.max(max, d);
      for (const cid of childrenOf.get(id) ?? []) walk(cid, d + 1);
    };
    walk(rootId, 0);
    return max;
  };

  const newParentDepth = depthOf(newParentId);
  const newStageDepth = newParentDepth + 1;
  const subtreeBelow = subtreeMaxDepth(stageId);
  if (newStageDepth + subtreeBelow > MAX_DEPTH) {
    return NextResponse.json(
      {
        error: `Перевищено максимальну глибину вкладення (${MAX_DEPTH + 1} рівнів)`,
      },
      { status: 400 },
    );
  }

  // Sibling-список нової локації — без переміщуваного стейджу. Sort by sortOrder ASC.
  const newSiblings = all
    .filter((s) => s.parentStageId === newParentId && s.id !== stageId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Insert at index = newSortOrder (clamp).
  const targetIndex = Math.max(0, Math.min(newSortOrder, newSiblings.length));

  await prisma.$transaction(async (tx) => {
    // Tomstone: тимчасово виставляємо переміщуваному великий sortOrder, щоб
    // уникнути unique-конфліктів якщо є composite-індекси (на майбутнє).
    await tx.projectStageRecord.update({
      where: { id: stageId },
      data: { sortOrder: 1_000_000 },
    });

    // Renumber siblings sequentially з пропуском targetIndex.
    let cursorOrder = 0;
    for (let i = 0; i <= newSiblings.length; i += 1) {
      if (i === targetIndex) {
        cursorOrder += 1;
      }
      const sib = newSiblings[i];
      if (!sib) continue;
      if (sib.sortOrder !== cursorOrder) {
        await tx.projectStageRecord.update({
          where: { id: sib.id },
          data: { sortOrder: cursorOrder },
        });
      }
      cursorOrder += 1;
    }

    // Записати фінальну позицію переміщуваного.
    await tx.projectStageRecord.update({
      where: { id: stageId },
      data: {
        parentStageId: newParentId,
        sortOrder: targetIndex,
      },
    });
  });

  await recalcCurrentStage(projectId, {
    syncBudget: false,
    userId: session.user.id,
  });

  await auditLog({
    userId: session.user.id,
    action: "UPDATE",
    entity: "ProjectStageRecord",
    entityId: stageId,
    projectId,
    newData: { parentStageId: newParentId, sortOrder: targetIndex },
  });

  return NextResponse.json({
    success: true,
    data: { id: stageId, parentStageId: newParentId, sortOrder: targetIndex },
  });
}
