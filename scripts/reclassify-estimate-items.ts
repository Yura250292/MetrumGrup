/**
 * One-off утиліта: переклассифікувати існуючі позиції кошторису як work/material
 * і прив'язати матеріали до батьківської роботи у тій же секції, через Gemini.
 *
 * Використання:
 *   npx tsx scripts/reclassify-estimate-items.ts "Стрийський парк"
 *   npx tsx scripts/reclassify-estimate-items.ts --estimate=<estimateId>
 *
 * Що робить:
 *   1. Шукає проєкт за substring назви, бере найновіший кошторис.
 *      (Або конкретний estimate за --estimate=ID.)
 *   2. Для кожної секції відправляє items[] у Gemini.
 *   3. Gemini повертає масив { itemType: "work"|"material", parentSortOrder: number|null }
 *      по 1 запису на item, у тому самому порядку.
 *   4. Скрипт оновлює EstimateItem (itemType + parentItemId).
 *   5. Викликає recomputeEstimateTotals — на випадок якщо desktop UI тепер
 *      агрегує по типу (на сьогодні не агрегує, але безпечно).
 *
 * Безпека:
 *   - DRY-RUN за замовчуванням. Реальні апдейти — лише з прапором --apply.
 *   - Парент має бути work і у тій самій секції; інакше скіпаємо звʼязок.
 */

import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { recomputeEstimateTotals } from "@/lib/estimates/recompute";

type Classification = {
  itemType: "work" | "material";
  parentSortOrder: number | null;
};

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const estimateArg = argv.find((a) => a.startsWith("--estimate="));
const explicitEstimateId = estimateArg ? estimateArg.split("=")[1] : null;
const nameArg = argv.find((a) => !a.startsWith("--"));

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY не налаштовано у .env");
  }

  let estimateId: string;
  if (explicitEstimateId) {
    estimateId = explicitEstimateId;
  } else {
    if (!nameArg) {
      throw new Error(
        'Вкажи назву проєкту: npx tsx scripts/reclassify-estimate-items.ts "Стрийський парк"'
      );
    }
    const project = await prisma.project.findFirst({
      where: { title: { contains: nameArg, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      include: {
        estimates: {
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, number: true, title: true, updatedAt: true },
        },
      },
    });
    if (!project) throw new Error(`Проєкт "${nameArg}" не знайдено`);
    if (project.estimates.length === 0) {
      throw new Error(`У проєкту "${project.title}" немає кошторисів`);
    }
    console.log(`\nПроєкт: ${project.title} (${project.id})`);
    console.log("Кошториси:");
    for (const e of project.estimates) {
      console.log(`  - ${e.number} "${e.title}" [${e.id}] ${e.updatedAt.toISOString()}`);
    }
    estimateId = project.estimates[0].id;
    console.log(`\nОбираю найновіший: ${estimateId}\n`);
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!estimate) throw new Error(`Кошторис ${estimateId} не знайдено`);

  console.log(`Кошторис: "${estimate.title}"`);
  console.log(`Секцій: ${estimate.sections.length}`);
  const totalItems = estimate.sections.reduce((sum, s) => sum + s.items.length, 0);
  console.log(`Позицій: ${totalItems}`);
  console.log(`Режим: ${APPLY ? "APPLY (запис у БД)" : "DRY-RUN (тільки звіт)"}`);
  console.log("");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  let updatedItemType = 0;
  let updatedParent = 0;
  let skipped = 0;

  for (const section of estimate.sections) {
    if (section.items.length === 0) continue;

    console.log(`\n── Секція: "${section.title}" (${section.items.length} позицій) ──`);

    const classifications = await classifySection(model, section.items);
    if (!classifications) {
      console.log("  [skip] Gemini не повернув валідну відповідь");
      skipped += section.items.length;
      continue;
    }

    if (classifications.length !== section.items.length) {
      console.log(
        `  [warn] Gemini повернув ${classifications.length} класифікацій для ${section.items.length} позицій — скіпаю секцію`
      );
      skipped += section.items.length;
      continue;
    }

    // Резолвимо parentSortOrder → parentItemId (через sortOrder у тій же секції).
    const idBySort = new Map<number, string>();
    for (const it of section.items) idBySort.set(it.sortOrder, it.id);

    for (let i = 0; i < section.items.length; i++) {
      const item = section.items[i];
      const cls: Classification = classifications[i];

      const newType: "work" | "material" =
        cls.itemType === "material" ? "material" : "work";

      let newParentId: string | null = null;
      if (newType === "material" && cls.parentSortOrder && cls.parentSortOrder > 0) {
        const parentSort = cls.parentSortOrder - 1;
        if (parentSort !== item.sortOrder) {
          const parentCls = classifications[parentSort];
          if (parentCls && parentCls.itemType === "work") {
            newParentId = idBySort.get(parentSort) ?? null;
          }
        }
      }

      const itemTypeChanged = (item.itemType ?? null) !== newType;
      const parentChanged = (item.parentItemId ?? null) !== newParentId;

      if (!itemTypeChanged && !parentChanged) continue;

      const arrow = `${item.itemType ?? "null"} → ${newType}${
        newParentId ? ` (parent: ${newParentId.slice(0, 8)}…)` : ""
      }`;
      console.log(`  [${i + 1}] ${item.description.slice(0, 70)}`);
      console.log(`        ${arrow}`);

      if (itemTypeChanged) updatedItemType++;
      if (parentChanged) updatedParent++;

      if (APPLY) {
        await prisma.estimateItem.update({
          where: { id: item.id },
          data: {
            itemType: newType,
            parentItemId: newParentId,
          },
        });
      }
    }
  }

  console.log("\n── Підсумок ──");
  console.log(`itemType змінено: ${updatedItemType}`);
  console.log(`parentItemId змінено: ${updatedParent}`);
  console.log(`Скіпнуто (Gemini не відповів): ${skipped}`);

  if (APPLY) {
    console.log("\nПерераховую totals…");
    await recomputeEstimateTotals(estimateId);
    console.log("✓ Готово.");
  } else {
    console.log("\nЦе був DRY-RUN. Для запису додай --apply.");
  }
}

async function classifySection(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  items: Array<{ description: string; unit: string; sortOrder: number; itemType: string | null }>
): Promise<Classification[] | null> {
  const list = items
    .map((it, i) => `${i + 1}. [${it.unit}] ${it.description}`)
    .join("\n");

  const prompt = `Ти - інженер-кошторисник. Дано список позицій у секції кошторису. Для кожної визнач:
- itemType: "work" якщо це фізична робота (монтаж, влаштування, демонтаж, обробка, прокладання, укладання, фарбування, штукатурка, заливка, зварювання тощо), або "material" якщо це матеріал/виріб/комплектуючий (плитка, профнастил, кабель, стовпці, лаги, саморізи, фарба, цемент, цегла, арматура, плити, дошки тощо).
- parentSortOrder: 1-based номер позиції з ЦЬОГО списку, до якої цей матеріал належить. Тільки якщо матеріал явно використовується для конкретної роботи з цього ж списку. Робота (itemType="work") ЗАВЖДИ має parentSortOrder=null.

Формат відповіді — СТРОГО JSON-масив довжиною ${items.length} (по одному обʼєкту на позицію, у тому самому порядку):
[
  {"itemType": "work", "parentSortOrder": null},
  {"itemType": "material", "parentSortOrder": 1},
  ...
]

Без пояснень, без markdown, тільки JSON.

Позиції:
${list}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // Видаляємо потенційні markdown fences
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((p) => ({
      itemType: p.itemType === "material" ? "material" : "work",
      parentSortOrder:
        typeof p.parentSortOrder === "number" && p.parentSortOrder > 0
          ? p.parentSortOrder
          : null,
    }));
  } catch (err) {
    console.error("  [error] Gemini failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
