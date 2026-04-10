/**
 * Backfill існуючих проектів у нову модель ProjectMember.
 *
 * Логіка:
 *   1. Для кожного проекту з managerId → upsert member з роллю PROJECT_MANAGER.
 *   2. Якщо у проекту є PROJECT conversation — для кожного staff participant
 *      робимо upsert member з роллю, виведеною з User.role:
 *        SUPER_ADMIN | MANAGER → PROJECT_ADMIN
 *        ENGINEER              → ENGINEER
 *        FINANCIER             → FINANCE
 *        USER                  → VIEWER
 *      Якщо учасник вже PROJECT_MANAGER (manager) — лишаємо PROJECT_MANAGER.
 *   3. CLIENT participants пропускаємо (рішення архітектури: клієнт лишається
 *      зовнішнім viewer і не стає ProjectMember).
 *
 * Скрипт ідемпотентний: повторні запуски безпечні через @@unique([projectId, userId]).
 *
 * Використання:
 *   npx tsx scripts/backfill-project-members.ts --dry-run
 *   npx tsx scripts/backfill-project-members.ts
 */

import { PrismaClient, type ProjectRole, type Role } from "@prisma/client";

const prisma = new PrismaClient();

const dryRun = process.argv.includes("--dry-run");

type Stats = {
  projectsScanned: number;
  managersAdded: number;
  staffAdded: number;
  clientsSkipped: number;
  alreadyExisted: number;
  warnings: string[];
};

function mapSystemRoleToProjectRole(role: Role): ProjectRole | null {
  switch (role) {
    case "SUPER_ADMIN":
    case "MANAGER":
      return "PROJECT_ADMIN";
    case "ENGINEER":
      return "ENGINEER";
    case "FINANCIER":
      return "FINANCE";
    case "USER":
      return "VIEWER";
    case "CLIENT":
      return null;
    default:
      return null;
  }
}

async function upsertMember(
  projectId: string,
  userId: string,
  roleInProject: ProjectRole,
  stats: Stats,
  label: string,
) {
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });

  if (existing) {
    stats.alreadyExisted += 1;
    return;
  }

  if (dryRun) {
    console.log(
      `   [dry-run] would add ${label}: user=${userId} role=${roleInProject}`,
    );
  } else {
    await prisma.projectMember.create({
      data: {
        projectId,
        userId,
        roleInProject,
        isActive: true,
      },
    });
  }

  if (label === "manager") {
    stats.managersAdded += 1;
  } else {
    stats.staffAdded += 1;
  }
}

async function main() {
  const stats: Stats = {
    projectsScanned: 0,
    managersAdded: 0,
    staffAdded: 0,
    clientsSkipped: 0,
    alreadyExisted: 0,
    warnings: [],
  };

  console.log(
    `\n🔧 Backfill ProjectMember${dryRun ? " (DRY RUN — no writes)" : ""}\n`,
  );

  const projects = await prisma.project.findMany({
    select: {
      id: true,
      title: true,
      managerId: true,
      manager: { select: { id: true, role: true } },
      conversation: {
        select: {
          id: true,
          participants: {
            select: {
              user: { select: { id: true, role: true, name: true } },
            },
          },
        },
      },
    },
  });

  for (const project of projects) {
    stats.projectsScanned += 1;
    console.log(`\n→ Project ${project.id} "${project.title}"`);

    // 1. Manager як PROJECT_MANAGER
    if (project.manager) {
      if (project.manager.role === "CLIENT") {
        stats.warnings.push(
          `Project ${project.id}: manager ${project.manager.id} has system role CLIENT — skipping`,
        );
        console.log(
          `   ⚠️ manager has CLIENT role — skipping (warning recorded)`,
        );
      } else {
        await upsertMember(
          project.id,
          project.manager.id,
          "PROJECT_MANAGER",
          stats,
          "manager",
        );
      }
    } else {
      console.log(`   (no manager assigned)`);
    }

    // 2. Staff conversation participants
    if (project.conversation) {
      for (const participant of project.conversation.participants) {
        const user = participant.user;

        if (user.role === "CLIENT") {
          stats.clientsSkipped += 1;
          continue;
        }

        // Skip якщо це manager — він вже доданий як PROJECT_MANAGER
        if (project.managerId && user.id === project.managerId) {
          continue;
        }

        const projectRole = mapSystemRoleToProjectRole(user.role);
        if (!projectRole) {
          stats.warnings.push(
            `Project ${project.id}: user ${user.id} (${user.name}) has unmapped role ${user.role}`,
          );
          continue;
        }

        await upsertMember(project.id, user.id, projectRole, stats, "staff");
      }
    }
  }

  console.log(`\n📊 Summary`);
  console.log(`   Projects scanned: ${stats.projectsScanned}`);
  console.log(`   Managers added:   ${stats.managersAdded}`);
  console.log(`   Staff added:      ${stats.staffAdded}`);
  console.log(`   Clients skipped:  ${stats.clientsSkipped}`);
  console.log(`   Already existed:  ${stats.alreadyExisted}`);
  console.log(`   Warnings:         ${stats.warnings.length}`);

  if (stats.warnings.length > 0) {
    console.log(`\n⚠️ Warnings:`);
    for (const w of stats.warnings) {
      console.log(`   - ${w}`);
    }
  }

  if (dryRun) {
    console.log(`\n✅ Dry run complete. Re-run without --dry-run to apply.`);
  } else {
    console.log(`\n✅ Backfill complete.`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
