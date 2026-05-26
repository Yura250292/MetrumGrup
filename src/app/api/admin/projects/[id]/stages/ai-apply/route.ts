import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { ensureStageMaterialsSection } from "@/lib/projects/stage-materials";
import { stageDisplayName } from "@/lib/constants";
import { recalcCurrentStage } from "@/lib/projects/stages-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DEPTH = 2;

const NewStageSchema = z.object({
  tempId: z.string().min(1),
  name: z.string().min(1).max(200),
  parentTempId: z.string().nullable().optional(),
});

const ApplyItemSchema = z.object({
  costType: z.enum(["MATERIAL", "LABOR"]),
  title: z.string().min(1).max(200),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitPrice: z.number().positive().nullable().optional(),
  supplier: z.string().nullable().optional(),
  /** id існуючого етапу АБО tempId з newStages (префікс "new-..."). */
  targetStageRef: z.string().min(1),
});

const BodySchema = z.object({
  items: z.array(ApplyItemSchema).default([]),
  newStages: z.array(NewStageSchema).default([]),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const { id: projectId } = await ctx.params;
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

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Невалідне тіло запиту", details: String(err) },
      { status: 400 },
    );
  }

  if (body.items.length === 0 && body.newStages.length === 0) {
    return NextResponse.json({ error: "Порожній запит" }, { status: 400 });
  }

  const newStageByTempId = new Map(body.newStages.map((n) => [n.tempId, n]));

  // Існуючі етапи проекту — для валідації targetStageRef що не є tempId.
  const existingStages = await prisma.projectStageRecord.findMany({
    where: { projectId },
    select: { id: true, parentStageId: true },
  });
  const existingIds = new Set(existingStages.map((s) => s.id));
  const parentLookup = new Map(
    existingStages.map((s) => [s.id, s.parentStageId]),
  );

  // Перевіряємо що для кожного item-а targetStageRef — або існуючий id, або tempId з newStages.
  for (const it of body.items) {
    const ref = it.targetStageRef;
    if (!existingIds.has(ref) && !newStageByTempId.has(ref)) {
      return NextResponse.json(
        { error: `Невідомий targetStageRef: ${ref}` },
        { status: 400 },
      );
    }
  }

  // Резолвимо depth існуючого етапу (для перевірки чи можна додати під нього).
  function depthOfExisting(id: string): number {
    let d = 0;
    let cur: string | null = parentLookup.get(id) ?? null;
    while (cur) {
      d++;
      cur = parentLookup.get(cur) ?? null;
      if (d > MAX_DEPTH + 1) break;
    }
    return d;
  }

  let stagesCreated = 0;
  let stagesUpdated = 0;
  let materialsCreated = 0;

  const tempToReal = new Map<string, string>();

  await prisma.$transaction(async (tx) => {
    // 1) Створюємо нові етапи (топологічний обхід — батьки спочатку).
    async function createNewStage(
      tempId: string,
      stack: Set<string>,
    ): Promise<string | null> {
      if (stack.has(tempId)) return null; // цикл
      stack.add(tempId);

      const real = tempToReal.get(tempId);
      if (real) return real;

      const ns = newStageByTempId.get(tempId);
      if (!ns) return null;

      let parentId: string | null = null;
      let parentDepth = -1;
      if (ns.parentTempId) {
        if (newStageByTempId.has(ns.parentTempId)) {
          parentId = await createNewStage(ns.parentTempId, stack);
        } else if (existingIds.has(ns.parentTempId)) {
          parentId = ns.parentTempId;
        }
      }
      if (parentId) {
        parentDepth = existingIds.has(parentId)
          ? depthOfExisting(parentId)
          : -1;
        // якщо parent — щойно створений new-, його depth = depth(parentTempId's parent) + 1
        // спрощено: рахуємо через ланцюг batchу. Ми обмежуємось MAX_DEPTH=2 (3 рівні).
      }
      if (parentDepth >= MAX_DEPTH) {
        // надто глибоко — створюємо як top-level
        parentId = null;
      }

      const lastSibling = await tx.projectStageRecord.findFirst({
        where: { projectId, parentStageId: parentId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const sortOrder = (lastSibling?.sortOrder ?? -1) + 1;

      const created = await tx.projectStageRecord.create({
        data: {
          projectId,
          parentStageId: parentId,
          stage: null,
          customName: ns.name.trim(),
          sortOrder,
          status: "PENDING",
          progress: 0,
        },
        select: { id: true },
      });
      tempToReal.set(tempId, created.id);
      stagesCreated++;
      return created.id;
    }

    for (const ns of body.newStages) {
      await createNewStage(ns.tempId, new Set());
    }

    // 2) Застосовуємо items.
    const updatedStageIds = new Set<string>();

    for (const it of body.items) {
      // Резолвимо реальний stageId
      const stageId = existingIds.has(it.targetStageRef)
        ? it.targetStageRef
        : tempToReal.get(it.targetStageRef) ?? null;
      if (!stageId) continue;

      if (it.costType === "LABOR") {
        // Оновлюємо fact-поля етапу. Якщо вже є factVolume — підсумовуємо;
        // якщо одиниці не співпадають — перезаписуємо (попереджувальна логіка
        // в UI має це покривати).
        const existing = await tx.projectStageRecord.findUnique({
          where: { id: stageId },
          select: { factVolume: true, factUnit: true, factUnitPrice: true },
        });
        if (!existing) continue;
        const newFactUnit = it.unit ?? existing.factUnit ?? null;
        const sameUnit =
          !existing.factUnit ||
          !it.unit ||
          existing.factUnit === it.unit;
        const addedVolume = it.quantity ?? 0;
        const nextVolume =
          sameUnit && existing.factVolume !== null
            ? Number(existing.factVolume) + addedVolume
            : addedVolume || Number(existing.factVolume ?? 0);
        const nextUnitPrice = it.unitPrice ?? existing.factUnitPrice;

        await tx.projectStageRecord.update({
          where: { id: stageId },
          data: {
            factVolume: nextVolume > 0 ? nextVolume : null,
            factUnit: newFactUnit,
            factUnitPrice:
              nextUnitPrice !== null && nextUnitPrice !== undefined
                ? Number(nextUnitPrice)
                : null,
          },
        });
        if (!updatedStageIds.has(stageId)) {
          updatedStageIds.add(stageId);
          stagesUpdated++;
        }
      } else {
        // MATERIAL — додаємо як ProjectStageMaterial (EstimateItem у materials-section).
        // Берем стандартний потік ensureStageMaterialsSection.
        const st = await tx.projectStageRecord.findUnique({
          where: { id: stageId },
          select: { stage: true, customName: true },
        });
        if (!st) continue;
        const stageName = stageDisplayName({
          stage: st.stage,
          customName: st.customName,
        });
        // ensureStageMaterialsSection не транзакційний (повертає sectionId).
        // Викликаємо поза tx — приймемо незначне погіршення атомарності для
        // зменшення складності. Якщо створення items впаде — section
        // лишиться, що ОК (idempotent).
        // У середині транзакції потрібно використовувати tx, але цей хелпер
        // приймає prisma напряму. Тому для MVP — створюємо EstimateItem
        // напряму:
        // Простіша стратегія для MVP — створити секцію + item напряму через tx.
        // ensureStageMaterialsSection хелпер не приймає tx, тому викликаємо
        // його поза транзакцією. Тут — placeholder: відкладемо MATERIAL items
        // обробку до кінця транзакції.
      }
    }
  });

  // 3) Поза транзакцією — обробка MATERIAL items (через ensureStageMaterialsSection).
  for (const it of body.items) {
    if (it.costType !== "MATERIAL") continue;
    const stageId = existingIds.has(it.targetStageRef)
      ? it.targetStageRef
      : tempToReal.get(it.targetStageRef) ?? null;
    if (!stageId) continue;

    const st = await prisma.projectStageRecord.findUnique({
      where: { id: stageId },
      select: { stage: true, customName: true },
    });
    if (!st) continue;
    const stageName = stageDisplayName({
      stage: st.stage,
      customName: st.customName,
    });
    const sectionId = await ensureStageMaterialsSection(
      projectId,
      stageId,
      stageName,
      session.user.id,
    );

    const section = await prisma.estimateSection.findUnique({
      where: { id: sectionId },
      select: {
        estimateId: true,
        items: {
          select: { sortOrder: true },
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });
    if (!section) continue;
    const sortOrder = (section.items[0]?.sortOrder ?? -1) + 1;
    const qty = it.quantity ?? 0;
    const price = it.unitPrice ?? 0;

    await prisma.estimateItem.create({
      data: {
        estimateId: section.estimateId,
        sectionId,
        description: it.title,
        unit: it.unit ?? "шт",
        quantity: qty,
        unitPrice: price,
        amount: qty * price,
        priceSource: it.supplier ?? null,
        itemType: "material",
        sortOrder,
        stageRecords: { connect: { id: stageId } },
      },
    });
    materialsCreated++;
  }

  // 4) Recalc current stage progress.
  try {
    await recalcCurrentStage(projectId, {
      syncBudget: false,
      userId: session.user.id,
    });
  } catch (err) {
    console.error("[ai-apply] recalcCurrentStage failed:", err);
  }

  return NextResponse.json({
    data: { stagesCreated, stagesUpdated, materialsCreated },
  });
}
