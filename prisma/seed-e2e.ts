/**
 * E2E test seed — IDEMPOTENT, NON-DESTRUCTIVE.
 *
 * Upserts:
 *   - Firms "metrum-group" + "metrum-studio" (if missing)
 *   - 8 test users (one per role) for Group + 1 Studio MANAGER
 *   - 1 SUPPLIER counterparty
 *   - 1 Group test project + 1 Studio test project
 *
 * Existing rows are matched by stable unique keys (email, project slug) so
 * repeated runs converge. This script must NEVER call deleteMany / db push /
 * migrate reset — it's safe to run against any environment.
 *
 * Env loading: mirrors Next.js dev — .env.local overrides .env, so the seed
 * always targets the same DB the dev server uses.
 *
 * Run: `npm run db:seed-e2e`
 * Login: see passwords below — `ChangeMe!2026` by default unless overridden.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(file: string) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// Next.js dev precedence: .env.local wins over .env. Load .env.local first so
// existing keys are claimed; .env then fills the gaps without overwriting.
loadEnvFile(".env.local");
loadEnvFile(".env");

import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = process.env.E2E_PASSWORD || "ChangeMe!2026";
const FIRM_ID = "metrum-group";
const STUDIO_FIRM_ID = "metrum-studio";
const STUDIO_MANAGER_EMAIL = "e2e-studio-manager@metrum-group.local";

const ROLES: Role[] = [
  "SUPER_ADMIN",
  "MANAGER",
  "ENGINEER",
  "FINANCIER",
  "HR",
  "FOREMAN",
  "CLIENT",
  "USER",
];

function emailFor(role: Role): string {
  return `e2e-${role.toLowerCase()}@metrum-group.local`;
}

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_E2E_SEED_IN_PROD !== "true"
  ) {
    throw new Error(
      "E2E seed blocked in production. Set ALLOW_E2E_SEED_IN_PROD=true to override.",
    );
  }

  console.log("🌱 E2E seed: ensuring firm + users + counterparty + project");

  await prisma.firm.upsert({
    where: { id: FIRM_ID },
    update: {},
    create: {
      id: FIRM_ID,
      slug: FIRM_ID,
      name: "Metrum Group (E2E)",
      isDefault: true,
    },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users: Record<Role, { id: string; email: string }> = {} as never;

  for (const role of ROLES) {
    const email = emailFor(role);
    const u = await prisma.user.upsert({
      where: { email },
      update: { role, firmId: FIRM_ID, isActive: true, password: passwordHash },
      create: {
        email,
        password: passwordHash,
        name: `E2E ${role}`,
        role,
        firmId: FIRM_ID,
        isActive: true,
      },
      select: { id: true, email: true },
    });
    users[role] = u;
    console.log(`  ✓ ${email} (${role})`);
  }

  // SUPPLIER counterparty for procurement public-bid flow.
  const supplierEmail = "e2e-supplier@metrum-group.local";
  const existingSupplier = await prisma.counterparty.findFirst({
    where: { email: supplierEmail, firmId: FIRM_ID },
    select: { id: true },
  });
  if (existingSupplier) {
    await prisma.counterparty.update({
      where: { id: existingSupplier.id },
      data: { isActive: true, roles: ["SUPPLIER"] },
    });
  } else {
    await prisma.counterparty.create({
      data: {
        firmId: FIRM_ID,
        name: "E2E Supplier",
        email: supplierEmail,
        roles: ["SUPPLIER"],
        isActive: true,
      },
    });
  }
  console.log(`  ✓ counterparty ${supplierEmail}`);

  // Stable test project — matched by slug (Project.slug is @unique).
  const projectSlug = "e2e-smoke-project";
  const projectTitle = "E2E Smoke Project";
  const existingProject = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true },
  });
  if (!existingProject) {
    await prisma.project.create({
      data: {
        slug: projectSlug,
        title: projectTitle,
        firmId: FIRM_ID,
        managerId: users.MANAGER.id,
        status: "ACTIVE",
        currentStage: "DESIGN",
        isTestProject: true,
      },
    });
    console.log(`  ✓ project "${projectTitle}"`);
  } else {
    console.log(`  ✓ project "${projectTitle}" (already exists)`);
  }

  // Studio firm + Studio MANAGER + Studio-only project (firm-isolation tests).
  await prisma.firm.upsert({
    where: { id: STUDIO_FIRM_ID },
    update: {},
    create: {
      id: STUDIO_FIRM_ID,
      slug: STUDIO_FIRM_ID,
      name: "Metrum Studio (E2E)",
      isDefault: false,
    },
  });

  const studioManager = await prisma.user.upsert({
    where: { email: STUDIO_MANAGER_EMAIL },
    update: { role: "MANAGER", firmId: STUDIO_FIRM_ID, isActive: true, password: passwordHash },
    create: {
      email: STUDIO_MANAGER_EMAIL,
      password: passwordHash,
      name: "E2E Studio MANAGER",
      role: "MANAGER",
      firmId: STUDIO_FIRM_ID,
      isActive: true,
    },
    select: { id: true },
  });
  console.log(`  ✓ ${STUDIO_MANAGER_EMAIL} (Studio MANAGER)`);

  const studioProjectSlug = "e2e-studio-project";
  const existingStudioProject = await prisma.project.findUnique({
    where: { slug: studioProjectSlug },
    select: { id: true },
  });
  if (!existingStudioProject) {
    await prisma.project.create({
      data: {
        slug: studioProjectSlug,
        title: "E2E Studio Project",
        firmId: STUDIO_FIRM_ID,
        managerId: studioManager.id,
        status: "ACTIVE",
        currentStage: "DESIGN",
        isTestProject: true,
      },
    });
    console.log(`  ✓ project "E2E Studio Project"`);
  } else {
    console.log(`  ✓ project "E2E Studio Project" (already exists)`);
  }

  console.log("✅ E2E seed complete.");
  console.log(`   Login with any of e2e-<role>@metrum-group.local`);
  console.log(`   Studio MANAGER: ${STUDIO_MANAGER_EMAIL}`);
  console.log(`   Password: ${PASSWORD === "ChangeMe!2026" ? "<default>" : "<from $E2E_PASSWORD>"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
