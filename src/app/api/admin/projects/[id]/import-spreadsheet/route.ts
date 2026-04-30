import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { parseSpreadsheetTsv, type ParsedNode } from "@/lib/projects/parse-spreadsheet";
import { recalcCurrentStage } from "@/lib/projects/stages-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Імпорт Excel/Google-Sheets-вставки у дерево стейджів.
 *
 * Body: { text: string } — TSV від Excel-paste.
 *
 * Алгоритм:
 *   1) parseSpreadsheetTsv → масив nodes з isSection / planVolume / unit / unitPrice ...
 *   2) Транзакція: створюємо top-level стейджі для розділів, child-стейджі для items
 *      зі sortOrder від останнього sibling+1. Не оновлюємо існуючі — лише ADD.
 *   3) Поза транзакцією: STAGE_AUTO sync для кожного нового стейджу з planVolume/price
 *      → одразу зʼявиться у фінансуванні.
 *   4) recalcCurrentStage.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const body = await request.json();
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "Порожній текст" }, { status: 400 });
  }
  // mode: "append" — додати до існуючого дерева (default).
  //       "replace" — повністю замінити дерево стейджів проєкту.
  const mode: "append" | "replace" = body.mode === "replace" ? "replace" : "append";

  // Дозволяємо клієнту або надіслати raw text, або вже розпарсені nodes
  // (зручно якщо UI робить preview і дозволяє редагувати перед import).
  const overrideNodes: ParsedNode[] | null = Array.isArray(body.nodes)
    ? (body.nodes as ParsedNode[])
    : null;

  const parseResult = overrideNodes
    ? { nodes: overrideNodes, errors: [] as { line: number; raw: string; reason: string }[] }
    : parseSpreadsheetTsv(text);

  if (parseResult.nodes.length === 0) {
    return NextResponse.json(
      { error: "Не вдалося розпізнати жодного рядка", parseErrors: parseResult.errors },
      { status: 400 },
    );
  }

  const created: { tempId: string; id: string }[] = [];
  let removedCount = 0;

  await prisma.$transaction(async (tx) => {
    // REPLACE-режим: спочатку видаляємо всі існуючі стейджі проєкту.
    // FinanceEntry-записи з stageRecordId — onDelete: SetNull, тобто
    // лишаються в фінансуванні без прив'язки. STAGE_AUTO records, які
    // без stage стають "сиротами", архівуються щоб не дублювати summary.
    if (mode === "replace") {
      const all = await tx.projectStageRecord.findMany({
        where: { projectId },
        select: { id: true },
      });
      removedCount = all.length;
      if (all.length > 0) {
        const ids = all.map((s) => s.id);
        // Спочатку архівуємо STAGE_AUTO, які прив'язані до видалюваних стейджів —
        // це уникає дублікатів якщо пізніше зробити sync-stages-finance.
        await tx.financeEntry.updateMany({
          where: {
            stageRecordId: { in: ids },
            source: "STAGE_AUTO",
            isArchived: false,
          },
          data: { isArchived: true, updatedById: session.user.id },
        });
        // Видалення стейджів — каскадно прибере дітей і залежності.
        await tx.projectStageRecord.deleteMany({ where: { id: { in: ids } } });
      }
    }

    // sortOrder для root-стейджів — продовжуємо існуючий.
    const lastRoot = await tx.projectStageRecord.findFirst({
      where: { projectId, parentStageId: null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextRootSortOrder = (lastRoot?.sortOrder ?? -1) + 1;

    // Map tempId → realId для дозвільнення parent-link у другому проході.
    const tempToReal = new Map<string, string>();

    // Pass 1: створюємо sections (parent=null).
    for (const node of parseResult.nodes) {
      if (!node.isSection) continue;
      const real = await tx.projectStageRecord.create({
        data: {
          projectId,
          parentStageId: null,
          customName: node.customName.slice(0, 200),
          status: "PENDING",
          sortOrder: nextRootSortOrder++,
        },
        select: { id: true },
      });
      tempToReal.set(node.tempId, real.id);
      created.push({ tempId: node.tempId, id: real.id });
    }

    // Pass 2: items (можуть мати parentTempId або null).
    const childCounters = new Map<string | null, number>();
    for (const node of parseResult.nodes) {
      if (node.isSection) continue;
      const parentRealId = node.parentTempId
        ? tempToReal.get(node.parentTempId) ?? null
        : null;
      // sortOrder per parent — починаючи з max+1 існуючих siblings.
      let nextSibling = childCounters.get(parentRealId);
      if (nextSibling === undefined) {
        const last = await tx.projectStageRecord.findFirst({
          where: { projectId, parentStageId: parentRealId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        nextSibling = (last?.sortOrder ?? -1) + 1;
      }
      const real = await tx.projectStageRecord.create({
        data: {
          projectId,
          parentStageId: parentRealId,
          customName: node.customName.slice(0, 200),
          status: "PENDING",
          sortOrder: nextSibling,
          unit: node.unit,
          planVolume: node.planVolume,
          planUnitPrice: node.planUnitPrice,
          planClientUnitPrice: node.planClientUnitPrice,
        },
        select: { id: true },
      });
      tempToReal.set(node.tempId, real.id);
      created.push({ tempId: node.tempId, id: real.id });
      childCounters.set(parentRealId, nextSibling + 1);
    }
  });

  // STAGE_AUTO у фінансування синхронізується окремою кнопкою «Зберегти у
  // фінансування» в інтерфейсі — щоб користувач міг переглянути імпорт
  // перед тим як числа потечуть у /financing.

  await recalcCurrentStage(projectId, { syncBudget: true, userId: session.user.id });

  return NextResponse.json({
    data: {
      mode,
      removed: removedCount,
      created: created.length,
      sections: parseResult.nodes.filter((n) => n.isSection).length,
      items: parseResult.nodes.filter((n) => !n.isSection).length,
      parseErrors: parseResult.errors,
    },
  });
}
