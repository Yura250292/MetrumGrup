/**
 * Idempotent seed of the default cost-code tree.
 *
 * Safe to run multiple times — uses upsert by `code`. Children point to parents
 * by `code` (not id), so order in the array matters (parents before children).
 *
 * Run: pnpm tsx scripts/seed-cost-codes.ts
 */
import { PrismaClient, CostType } from "@prisma/client";

const prisma = new PrismaClient();

type Node = {
  code: string;
  name: string;
  parentCode?: string;
  defaultCostType?: CostType;
  sortOrder?: number;
};

const TREE: Node[] = [
  // 01 Підготовчі
  { code: "01", name: "Підготовчі роботи", sortOrder: 10 },
  { code: "01.1", name: "Демонтаж", parentCode: "01", defaultCostType: "LABOR", sortOrder: 10 },
  { code: "01.2", name: "Винесення сміття", parentCode: "01", defaultCostType: "LABOR", sortOrder: 20 },

  // 02 Конструктив
  { code: "02", name: "Конструктив", sortOrder: 20 },
  { code: "02.1", name: "Стіни і перегородки", parentCode: "02", defaultCostType: "MATERIAL", sortOrder: 10 },
  { code: "02.2", name: "Стяжки і вирівнювання", parentCode: "02", defaultCostType: "MATERIAL", sortOrder: 20 },
  { code: "02.3", name: "Гідроізоляція", parentCode: "02", defaultCostType: "MATERIAL", sortOrder: 30 },

  // 03 Інженерія
  { code: "03", name: "Інженерія", sortOrder: 30 },
  { code: "03.1", name: "Електрика", parentCode: "03", defaultCostType: "SUBCONTRACT", sortOrder: 10 },
  { code: "03.2", name: "Сантехніка", parentCode: "03", defaultCostType: "SUBCONTRACT", sortOrder: 20 },
  { code: "03.3", name: "Опалення / вентиляція", parentCode: "03", defaultCostType: "SUBCONTRACT", sortOrder: 30 },
  { code: "03.4", name: "Слабкоструми", parentCode: "03", defaultCostType: "SUBCONTRACT", sortOrder: 40 },

  // 04 Опорядження
  { code: "04", name: "Опорядження", sortOrder: 40 },
  { code: "04.1", name: "Стіни (фарба, шпалери, плитка)", parentCode: "04", defaultCostType: "MATERIAL", sortOrder: 10 },
  { code: "04.2", name: "Підлога", parentCode: "04", defaultCostType: "MATERIAL", sortOrder: 20 },
  { code: "04.3", name: "Стелі", parentCode: "04", defaultCostType: "MATERIAL", sortOrder: 30 },
  { code: "04.4", name: "Двері і вікна", parentCode: "04", defaultCostType: "MATERIAL", sortOrder: 40 },
  { code: "04.5", name: "Сантехнічні прибори", parentCode: "04", defaultCostType: "MATERIAL", sortOrder: 50 },

  // 05 Меблі і техніка
  { code: "05", name: "Меблі і техніка", sortOrder: 50 },
  { code: "05.1", name: "Кухня", parentCode: "05", defaultCostType: "MATERIAL", sortOrder: 10 },
  { code: "05.2", name: "Гардероби і вбудовані меблі", parentCode: "05", defaultCostType: "MATERIAL", sortOrder: 20 },
  { code: "05.3", name: "Побутова техніка", parentCode: "05", defaultCostType: "MATERIAL", sortOrder: 30 },

  // 06 Благоустрій і фасад
  { code: "06", name: "Благоустрій і фасад", sortOrder: 60 },
  { code: "06.1", name: "Фасад", parentCode: "06", defaultCostType: "MATERIAL", sortOrder: 10 },
  { code: "06.2", name: "Тераса / двір", parentCode: "06", defaultCostType: "LABOR", sortOrder: 20 },

  // 07 Клінінг
  { code: "07", name: "Клінінг", sortOrder: 70 },
  { code: "07.1", name: "Будівельне прибирання", parentCode: "07", defaultCostType: "SUBCONTRACT", sortOrder: 10 },
  { code: "07.2", name: "Фінальне прибирання", parentCode: "07", defaultCostType: "SUBCONTRACT", sortOrder: 20 },

  // 08 Накладні
  { code: "08", name: "Накладні витрати", sortOrder: 80 },
  { code: "08.1", name: "Управління проєктом", parentCode: "08", defaultCostType: "OVERHEAD", sortOrder: 10 },
  { code: "08.2", name: "Транспорт і логістика", parentCode: "08", defaultCostType: "OVERHEAD", sortOrder: 20 },
  { code: "08.3", name: "Оренда обладнання", parentCode: "08", defaultCostType: "EQUIPMENT", sortOrder: 30 },
  { code: "08.4", name: "Адміністративні", parentCode: "08", defaultCostType: "OVERHEAD", sortOrder: 40 },

  // 09 Податки
  { code: "09", name: "Податки", defaultCostType: "OVERHEAD", sortOrder: 90 },
  { code: "09.1", name: "ПДВ", parentCode: "09", defaultCostType: "OVERHEAD", sortOrder: 10 },
  { code: "09.2", name: "ЄСВ", parentCode: "09", defaultCostType: "OVERHEAD", sortOrder: 20 },
  { code: "09.3", name: "ПДФО + ВЗ", parentCode: "09", defaultCostType: "OVERHEAD", sortOrder: 30 },
];

async function main() {
  console.log("🌱 Seeding cost-codes…");

  // Two passes: roots first, then children. Within each pass, walk in order.
  const roots = TREE.filter((n) => !n.parentCode);
  const children = TREE.filter((n) => n.parentCode);

  for (const node of roots) {
    await prisma.costCode.upsert({
      where: { code: node.code },
      create: {
        code: node.code,
        name: node.name,
        defaultCostType: node.defaultCostType,
        sortOrder: node.sortOrder ?? 0,
        isSystem: true,
      },
      update: {
        name: node.name,
        defaultCostType: node.defaultCostType,
        sortOrder: node.sortOrder ?? 0,
        isSystem: true,
      },
    });
  }

  for (const node of children) {
    const parent = await prisma.costCode.findUnique({ where: { code: node.parentCode! } });
    if (!parent) {
      console.warn(`  ⚠️  parent ${node.parentCode} missing for ${node.code}`);
      continue;
    }
    await prisma.costCode.upsert({
      where: { code: node.code },
      create: {
        code: node.code,
        name: node.name,
        parentId: parent.id,
        defaultCostType: node.defaultCostType,
        sortOrder: node.sortOrder ?? 0,
        isSystem: true,
      },
      update: {
        name: node.name,
        parentId: parent.id,
        defaultCostType: node.defaultCostType,
        sortOrder: node.sortOrder ?? 0,
        isSystem: true,
      },
    });
  }

  const total = await prisma.costCode.count();
  console.log(`✅ cost-codes ok (total in DB: ${total})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
