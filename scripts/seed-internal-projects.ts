/**
 * Seed internal (non-construction) projects for personal/business tasks.
 * Run: npx tsx scripts/seed-internal-projects.ts
 *
 * These projects have isInternal=true and a single DESIGN stage used as
 * a generic container for tasks. They appear in the "New task" modal
 * alongside construction projects.
 *
 * Safe to run multiple times — skips projects that already exist (by slug).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INTERNAL_PROJECTS = [
  { title: "Розробка сайту", slug: "internal-web-dev" },
  { title: "Реклама", slug: "internal-ads" },
  { title: "Маркетинг", slug: "internal-marketing" },
  { title: "Продажі", slug: "internal-sales" },
  { title: "HR та команда", slug: "internal-hr" },
  { title: "Адміністрація", slug: "internal-admin" },
];

async function main() {
  // Find the first SUPER_ADMIN to use as client/manager
  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true },
  });
  if (!admin) {
    console.error("No SUPER_ADMIN user found. Create one first.");
    process.exit(1);
  }

  let created = 0;
  for (const def of INTERNAL_PROJECTS) {
    const existing = await prisma.project.findUnique({ where: { slug: def.slug } });
    if (existing) {
      console.log("  skip (exists): " + def.title);
      continue;
    }

    const project = await prisma.project.create({
      data: {
        title: def.title,
        slug: def.slug,
        isInternal: true,
        status: "ACTIVE",
        currentStage: "DESIGN",
        clientId: admin.id,
        managerId: admin.id,
        stages: {
          create: {
            stage: "DESIGN",
            status: "IN_PROGRESS",
            sortOrder: 0,
          },
        },
      },
    });

    // Seed default task statuses and labels
    await prisma.taskStatus.createMany({
      data: [
        { projectId: project.id, name: "Backlog", color: "#94a3b8", position: 0, isDone: false, isDefault: true },
        { projectId: project.id, name: "In Progress", color: "#3b82f6", position: 1, isDone: false, isDefault: false },
        { projectId: project.id, name: "In Review", color: "#f59e0b", position: 2, isDone: false, isDefault: false },
        { projectId: project.id, name: "Done", color: "#10b981", position: 3, isDone: true, isDefault: false },
      ],
      skipDuplicates: true,
    });

    // Enable tasks feature for this project
    await prisma.setting.upsert({
      where: { id: "tasks_enabled_global" },
      create: { id: "tasks_enabled_global", value: true },
      update: {},
    });

    console.log("  created: " + def.title + " (id=" + project.id + ")");
    created++;
  }

  console.log("Done. Created " + created + " internal projects.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
