/**
 * Seed for the multi-apartment renovation project "Тіфані" in Metrum Studio.
 * Creates the Project + one ProjectStageRecord per apartment, each with
 * customName "Квартира N". Idempotent — re-runs only insert what's missing.
 *
 * Usage: npx tsx scripts/seed-tiffani.ts
 */
import { prisma } from "../src/lib/prisma";

const FIRM_SLUG = "metrum-studio";
const PROJECT_SLUG = "tiffani";
const PROJECT_TITLE = "Тіфані";
const APARTMENT_NUMBERS = [49, 52, 54, 154, 159, 160, 164, 192, 197, 201, 204, 205] as const;
const EXTRA_STAGES = ["Тестова квартира", "Загальна"] as const;

async function main() {
  const firm = await prisma.firm.findUnique({ where: { slug: FIRM_SLUG } });
  if (!firm) throw new Error(`Firm "${FIRM_SLUG}" not found`);
  console.log(`✓ Firm: ${firm.name} (${firm.id})`);

  let project = await prisma.project.findUnique({ where: { slug: PROJECT_SLUG } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        title: PROJECT_TITLE,
        slug: PROJECT_SLUG,
        status: "ACTIVE",
        firmId: firm.id,
        clientName: "Тіфані",
        description: "Багатоповерхівка, ремонт квартир. Витрати приходять із Telegram-форуму, кожен топік = квартира.",
      },
    });
    console.log(`✓ Project created: ${project.title} (${project.id})`);
  } else {
    console.log(`= Project already exists: ${project.title} (${project.id})`);
  }

  const allStageNames = [
    ...APARTMENT_NUMBERS.map((n) => `Квартира ${n}`),
    ...EXTRA_STAGES,
  ];

  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < allStageNames.length; i++) {
    const customName = allStageNames[i];
    const existing = await prisma.projectStageRecord.findFirst({
      where: { projectId: project.id, customName, parentStageId: null },
    });
    if (existing) {
      skippedCount++;
      continue;
    }
    const stage = await prisma.projectStageRecord.create({
      data: {
        projectId: project.id,
        customName,
        kind: "STAGE",
        status: "PENDING",
        progress: 0,
        sortOrder: i,
      },
      select: { id: true, customName: true },
    });
    console.log(`  + ${stage.customName} (${stage.id})`);
    createdCount++;
  }

  console.log(`\nDone. Created: ${createdCount}, skipped: ${skippedCount}.`);
  console.log(`\nNext: bind Telegram group to project with /link ${PROJECT_SLUG} in the General topic of the Тіфані forum.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
