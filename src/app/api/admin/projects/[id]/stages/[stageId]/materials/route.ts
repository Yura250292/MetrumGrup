import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { ensureStageMaterialsSection } from "@/lib/projects/stage-materials";
import { stageDisplayName } from "@/lib/constants";

/**
 * Materials linked to a stage. Source priority:
 *   1. EstimateItem.stageRecords (explicit M2N relation `EstimateItemToStage`)
 *   2. EstimateItems of the stage's `sourceEstimateSection`
 *
 * Each row exposes plan vs. fact quantity/price + supplier (counterparty fallback).
 * Used by the bottom split-panel "Матеріали" tab in the cross-project stages view.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const { id: projectId, stageId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.role !== "MANAGER" &&
    session.user.role !== "FINANCIER" &&
    session.user.role !== "ENGINEER"
  ) {
    return forbiddenResponse();
  }

  const stage = await prisma.projectStageRecord.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      projectId: true,
      sourceEstimateSectionId: true,
      sourceEstimateItemId: true,
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

  const items = await prisma.estimateItem.findMany({
    where: {
      OR: [
        { stageRecords: { some: { id: stageId } } },
        ...(stage.sourceEstimateSectionId
          ? [{ sectionId: stage.sourceEstimateSectionId }]
          : []),
      ],
    },
    select: {
      id: true,
      description: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      amount: true,
      itemType: true,
      priceSource: true,
      material: {
        select: {
          id: true,
          name: true,
          sku: true,
          basePrice: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Plan vs fact: estimate has plan numbers; FinanceEntry of type FACT/EXPENSE
  // linked to this stage represents actual spend per material (best-effort match
  // by estimateItemId). Aggregate fact amount per estimateItemId.
  const factEntries = await prisma.financeEntry.groupBy({
    by: ["estimateItemId"],
    where: {
      projectId,
      stageRecordId: stageId,
      kind: "FACT",
      type: "EXPENSE",
      isArchived: false,
      estimateItemId: { not: null },
    },
    _sum: { amount: true },
  });
  const factByItem = new Map<string, number>();
  for (const row of factEntries) {
    if (row.estimateItemId) {
      factByItem.set(row.estimateItemId, Number(row._sum.amount ?? 0));
    }
  }

  const data = items.map((it) => {
    const planQty = Number(it.quantity);
    const planPrice = Number(it.unitPrice);
    const planSum = Number(it.amount);
    const factSum = factByItem.get(it.id) ?? 0;
    // Fact qty/price not separately stored — derive ratio when fact present.
    const factQty = factSum > 0 && planPrice > 0 ? factSum / planPrice : null;
    return {
      id: it.id,
      name: it.material?.name ?? it.description,
      sku: it.material?.sku ?? null,
      itemType: it.itemType,
      supplier: it.priceSource ?? null,
      unit: it.unit,
      planQty,
      factQty,
      planPrice,
      factPrice: planPrice,
      planSum,
      factSum,
      deviation: factSum - planSum,
      status: factSum >= planSum && planSum > 0 ? "Використано" : factSum > 0 ? "Частково" : "Заплановано",
    };
  });

  return NextResponse.json({ data });
}

/**
 * Додає матеріал до етапу. Якщо stage ще не має sourceEstimateSection —
 * автоматично створює системний Estimate «Матеріали етапів» (один на
 * проєкт) і EstimateSection (одну на етап), потім додає EstimateItem
 * у цю секцію.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const { id: projectId, stageId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.role !== "MANAGER" &&
    session.user.role !== "ENGINEER"
  ) {
    return forbiddenResponse();
  }

  const stage = await prisma.projectStageRecord.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      projectId: true,
      stage: true,
      customName: true,
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

  const body = await request.json();
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  if (!name) {
    return NextResponse.json({ error: "Назва обовʼязкова" }, { status: 400 });
  }
  const unit =
    typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "шт";
  const planQty = Number(body.planQty);
  const planPrice = Number(body.planPrice);
  if (!Number.isFinite(planQty) || planQty < 0) {
    return NextResponse.json(
      { error: "Невірна кількість" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(planPrice) || planPrice < 0) {
    return NextResponse.json(
      { error: "Невірна ціна" },
      { status: 400 },
    );
  }
  const supplier =
    typeof body.supplier === "string" && body.supplier.trim()
      ? body.supplier.trim()
      : null;

  const stageName = stageDisplayName({
    stage: stage.stage,
    customName: stage.customName,
  });
  const sectionId = await ensureStageMaterialsSection(
    projectId,
    stageId,
    stageName,
    session.user.id,
  );

  const section = await prisma.estimateSection.findUnique({
    where: { id: sectionId },
    select: { estimateId: true, items: { select: { sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 } },
  });
  if (!section) {
    return NextResponse.json(
      { error: "Не вдалось підготувати секцію матеріалів" },
      { status: 500 },
    );
  }
  const sortOrder = (section.items[0]?.sortOrder ?? -1) + 1;

  const created = await prisma.estimateItem.create({
    data: {
      description: name,
      unit,
      quantity: planQty,
      unitPrice: planPrice,
      amount: planQty * planPrice,
      estimateId: section.estimateId,
      sectionId,
      sortOrder,
      priceSource: supplier,
      itemType: "material",
      stageRecords: { connect: { id: stageId } },
    },
    select: { id: true },
  });

  return NextResponse.json({ data: { id: created.id } }, { status: 201 });
}
