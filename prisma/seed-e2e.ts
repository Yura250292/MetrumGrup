/**
 * E2E test seed — IDEMPOTENT, NON-DESTRUCTIVE.
 *
 * Upserts:
 *   - Firm "metrum-group" (if missing)
 *   - 8 test users (one per role) with stable emails `e2e-<role>@metrum-group.local`
 *   - 1 SUPPLIER counterparty `e2e-supplier@metrum-group.local`
 *   - 1 test project owned by the MANAGER user
 *
 * Existing rows are matched by stable unique keys (email, project title) so
 * repeated runs converge. This script must NEVER call deleteMany / db push /
 * migrate reset — it's safe to run against any environment.
 *
 * Run: `npm run db:seed-e2e`
 * Login: see passwords below — `ChangeMe!2026` by default unless overridden.
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = process.env.E2E_PASSWORD || "ChangeMe!2026";
const FIRM_ID = "metrum-group";

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
      update: { role, firmId: FIRM_ID, isActive: true },
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

  console.log("✅ E2E seed complete.");
  console.log(`   Login with any of e2e-<role>@metrum-group.local`);
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
