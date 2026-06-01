import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { ensureActiveEstimateVersion } from "@/lib/estimates/ensure-version";
import Decimal from "decimal.js";
import type { ParsedPlanItem, ParseProjectPlanResult } from "@/lib/parsers/excel-project-plan-parser";

export type ImportPlanResult = {
  estimateId: string;
  projectId: string;
  sectionsCreated: number;
  itemsCreated: number;
  predecessorsResolved: number;
  /** Скільки рядків мали попередника, якого не вдалося резолвити. */
  predecessorsUnresolved: number;
  warnings: string[];
};

/**
 * Створює окремий Estimate (DRAFT, role=INTERNAL) у вказаному проєкті
 * на основі парсу `parseExcelProjectPlan`. Унікальні значення колонки
 * "Етап" стають EstimateSection; рядки — EstimateItem зі заповненими
 * planning-полями.
 *
 * Predecessor (string "1.2", "2.13" з Excel) резолвиться у FK
 * `predecessorItemId` другим проходом — після того як усі items
 * створено і відомі їх ID.
 *
 * Транзакційно: будь-яка помилка → rollback усього імпорту, нічого не
 * залишається в БД у напівстворенному стані.
 */
export async function importExcelPlanToEstimate(opts: {
  projectId: string;
  userId: string;
  parsed: ParseProjectPlanResult;
  /** Title для нового Estimate. За замовч. — назва проєкту з Excel або «Імпорт Excel». */
  estimateTitle?: string;
}): Promise<ImportPlanResult> {
  const { projectId, userId, parsed } = opts;
  if (!parsed.success || parsed.items.length === 0) {
    throw new Error("Парсер не повернув валідних рядків");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });
  if (!project) throw new Error("Проєкт не знайдено");

  // Унікальні Етапи → секції (зі сталим порядком — за першим входженням).
  const sectionTitles: string[] = [];
  const sectionTitleSet = new Set<string>();
  for (const it of parsed.items) {
    if (!sectionTitleSet.has(it.etap)) {
      sectionTitles.push(it.etap);
      sectionTitleSet.add(it.etap);
    }
  }

  const result: ImportPlanResult = {
    estimateId: "",
    projectId,
    sectionsCreated: sectionTitles.length,
    itemsCreated: 0,
    predecessorsResolved: 0,
    predecessorsUnresolved: 0,
    warnings: [...parsed.warnings],
  };

  await prisma.$transaction(async (tx) => {
    const number = await generateEstimateNumber(tx);
    const title =
      opts.estimateTitle ?? parsed.project?.title ?? project.title + " (Excel)";

    const estimate = await tx.estimate.create({
      data: {
        number,
        projectId,
        createdById: userId,
        title,
        status: "DRAFT",
        role: "INTERNAL",
        totalMaterials: 0,
        totalLabor: 0,
        totalOverhead: 0,
        totalAmount: 0,
        finalAmount: 0,
        sections: {
          create: sectionTitles.map((t, idx) => ({
            title: t,
            sortOrder: idx,
          })),
        },
      },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    result.estimateId = estimate.id;

    const sectionIdByTitle = new Map<string, string>();
    for (const s of estimate.sections) sectionIdByTitle.set(s.title, s.id);

    // Pass 1: створення items без predecessor-FK. Тримаємо seq → id мапу.
    const idBySeq = new Map<string, string>();
    let totalAmount = 0;
    const sectionItemCount = new Map<string, number>();
    for (const it of parsed.items) {
      const sectionId = sectionIdByTitle.get(it.etap);
      if (!sectionId) {
        result.warnings.push(`Item ${it.seq}: section "${it.etap}" не створено`);
        continue;
      }
      const idx = (sectionItemCount.get(sectionId) ?? 0) + 1;
      sectionItemCount.set(sectionId, idx);

      const unitCost = it.unitCost ?? 0;
      const unitPriceCustomer = it.unitPriceCustomer ?? unitCost * 1.2;
      const amount = new Decimal(it.quantity).times(unitCost).toFixed(2);
      totalAmount += Number(amount);

      const created = await tx.estimateItem.create({
        data: {
          estimateId: estimate.id,
          sectionId,
          description: it.description.slice(0, 1000),
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: unitCost,
          unitCost,
          unitPriceCustomer,
          amount,
          itemType: it.itemType,
          sortOrder: idx - 1,
          plannedStart: it.plannedStart,
          plannedDurationDays: it.plannedDurationDays,
          dependencyType: it.dependencyType,
          dependencyLagDays: it.dependencyLagDays,
        },
        select: { id: true },
      });
      idBySeq.set(it.seq, created.id);
      result.itemsCreated += 1;
    }

    // Pass 2: резолв predecessor-string → FK.
    for (const it of parsed.items) {
      if (!it.predecessorSeq) continue;
      const itemId = idBySeq.get(it.seq);
      const predecessorId = idBySeq.get(it.predecessorSeq);
      if (!itemId) continue;
      if (!predecessorId) {
        result.predecessorsUnresolved += 1;
        result.warnings.push(
          `Item ${it.seq}: предка "${it.predecessorSeq}" не знайдено в imported items`,
        );
        continue;
      }
      await tx.estimateItem.update({
        where: { id: itemId },
        data: { predecessorItemId: predecessorId },
      });
      result.predecessorsResolved += 1;
    }

    // Оновити сумарну ціну на Estimate.
    await tx.estimate.update({
      where: { id: estimate.id },
      data: { totalAmount, finalAmount: totalAmount },
    });
  });

  await auditLog({
    userId,
    action: "CREATE",
    entity: "Estimate",
    entityId: result.estimateId,
    projectId,
    newData: {
      operation: "importExcelPlanToEstimate",
      sectionsCreated: result.sectionsCreated,
      itemsCreated: result.itemsCreated,
      predecessorsResolved: result.predecessorsResolved,
      predecessorsUnresolved: result.predecessorsUnresolved,
    },
  });

  // Гарантуємо активну версію v1 (після commit tx).
  if (result.estimateId) {
    try {
      await ensureActiveEstimateVersion(result.estimateId, userId);
    } catch (err) {
      console.error("[import-excel-plan] ensureActiveEstimateVersion failed:", err);
    }
  }

  return result;
}

/**
 * Згенерувати номер estimate-у. Простий лічильник: знаходимо найбільший
 * EST-NNN серед існуючих і додаємо 1. Достатньо для імпорту-однострілу.
 */
async function generateEstimateNumber(
  tx: Pick<typeof prisma, "estimate">,
): Promise<string> {
  const latest = await tx.estimate.findFirst({
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  let next = 1;
  if (latest?.number) {
    const match = latest.number.match(/(\d+)$/);
    if (match) next = parseInt(match[1]!, 10) + 1;
  }
  return `EST-${String(next).padStart(4, "0")}`;
}
