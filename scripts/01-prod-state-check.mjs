#!/usr/bin/env node
/**
 * Stage 1 — Read-only діагностика prod БД перед deploy.
 *
 * Перевіряє:
 *  1. Чи існує _prisma_migrations таблиця (після інциденту 2026-05-22 — НІ)
 *  2. Які з нових таблиць roadmap-2026 уже в prod
 *  3. Які колонки SRM extension присутні на Counterparty
 *  4. Поточні rows на ключових моделях
 *
 * Виводить рекомендації: які міграції baseline-нути як applied,
 * які запустити через `prisma migrate deploy`.
 *
 * Використання:
 *   DATABASE_URL=<PROD_URL> node scripts/01-prod-state-check.mjs
 *
 * SAFETY: read-only. Не змінює нічого.
 */

import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL not set. Pass as env var:");
  console.error("   DATABASE_URL='<prod url>' node scripts/01-prod-state-check.mjs");
  process.exit(1);
}

// Замаскований лог
const masked = url.replace(/:[^:@]+@/, ":****@");
console.log("=".repeat(72));
console.log("🔍 PROD STATE CHECK (read-only)");
console.log("DB:", masked);
console.log("=".repeat(72));

const p = new PrismaClient({ datasources: { db: { url } } });

// ── 1. _prisma_migrations table ────────────────────────────────────────────
console.log("\n[1] _prisma_migrations table:");
const migrationsTableExists = await p
  .$queryRawUnsafe(
    "SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations' LIMIT 1",
  )
  .then((r) => Array.isArray(r) && r.length > 0)
  .catch(() => false);

if (migrationsTableExists) {
  const count = await p
    .$queryRawUnsafe("SELECT COUNT(*)::int as c FROM _prisma_migrations")
    .then((r) => r[0]?.c ?? 0)
    .catch(() => 0);
  console.log(`  ✅ existe — ${count} applied migrations recorded`);
} else {
  console.log("  ❌ NOT EXISTS — потрібен baseline (інакше migrate deploy");
  console.log("     спробує застосувати ВСІ 96 міграцій і впаде на 'already exists').");
}

// ── 2. Нові таблиці roadmap-2026 ───────────────────────────────────────────
console.log("\n[2] Roadmap-2026 tables presence:");
const NEW_TABLES = {
  cost_codes: "Task 01 (Cost Codes)",
  change_orders: "Task 02 (Change Orders)",
  change_order_items: "Task 02 (Change Orders)",
  form_templates: "Task 03 (Site Forms)",
  form_submissions: "Task 03 (Site Forms)",
  task_dependencies: "Task 05 (Gantt — DEPS)",
  incoming_documents: "Task 06 (AI Document Control)",
  document_extraction_logs: "Task 06 (AI Document Control)",
  rfis: "Task 07 (RFI)",
  rfi_attachments: "Task 07 (RFI)",
  counterparty_reviews: "Task 08 (SRM)",
  counterparty_documents: "Task 08 (SRM)",
  purchase_requests: "Task 09 (Procurement)",
  rfqs: "Task 09 (Procurement)",
  bids: "Task 09 (Procurement)",
  purchase_orders: "Task 09 (Procurement)",
};

const missingTables = [];
for (const [table, label] of Object.entries(NEW_TABLES)) {
  const exists = await p
    .$queryRawUnsafe(
      `SELECT 1 FROM information_schema.tables WHERE table_name = '${table}' LIMIT 1`,
    )
    .then((r) => Array.isArray(r) && r.length > 0)
    .catch(() => false);
  console.log(`  ${exists ? "✅" : "❌"} ${table.padEnd(28)} — ${label}`);
  if (!exists) missingTables.push(table);
}

// ── 3. SRM extension on Counterparty ───────────────────────────────────────
console.log("\n[3] SRM extension on counterparties:");
const SRM_COLS = [
  "legalForm",
  "ipn",
  "licenseNumber",
  "licenseValidUntil",
  "dabiRegistration",
  "taxStatus",
  "specializations",
  "avgRating",
  "totalProjects",
];
let srmExtensionApplied = true;
for (const col of SRM_COLS) {
  const exists = await p
    .$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'counterparties' AND column_name = '${col}' LIMIT 1`,
    )
    .then((r) => Array.isArray(r) && r.length > 0)
    .catch(() => false);
  console.log(`  ${exists ? "✅" : "❌"} ${col}`);
  if (!exists) srmExtensionApplied = false;
}

// ── 4. Key model row counts ────────────────────────────────────────────────
console.log("\n[4] Key row counts:");
const checkModel = async (name, model) => {
  try {
    const c = await model.count();
    console.log(`  ${name}: ${c}`);
  } catch (e) {
    console.log(`  ${name}: ❌ ${e.message.split("\n")[0].slice(0, 60)}`);
  }
};
await checkModel("users", p.user);
await checkModel("projects", p.project);
await checkModel("counterparties", p.counterparty);
await checkModel("financeEntries", p.financeEntry);
await checkModel("employees", p.employee);
await checkModel("costCodes", p.costCode);

// ── 5. Recommendation ──────────────────────────────────────────────────────
console.log("\n" + "=".repeat(72));
console.log("📋 РЕКОМЕНДАЦІЯ");
console.log("=".repeat(72));

if (!migrationsTableExists) {
  console.log("\n1️⃣  Baseline ВСІХ 96 міграцій як 'applied' через:");
  console.log("    DATABASE_URL=<PROD> node scripts/02-baseline-prod-migrations.mjs --confirm");
  console.log("\n    Це створить таблицю _prisma_migrations і запише туди");
  console.log("    усі міграції, чиї tables/columns уже існують у БД.");
}

if (missingTables.length > 0) {
  console.log(`\n2️⃣  Після baseline — запустити migrate deploy для ${missingTables.length} нових таблиць:`);
  missingTables.forEach((t) => console.log(`    • ${t}`));
  console.log("\n    DATABASE_URL=<PROD> npx prisma migrate deploy");
}

if (!srmExtensionApplied) {
  console.log("\n3️⃣  SRM extension (Task 08) — НЕ застосовано до Counterparty.");
  console.log("    Buduть додано через migrate deploy (міграція");
  console.log("    20260525184358_srm_counterparty_extension).");
}

if (
  migrationsTableExists &&
  missingTables.length === 0 &&
  srmExtensionApplied
) {
  console.log("\n✅ Prod вже в актуальному стані — нічого не треба.");
}

console.log("\n" + "=".repeat(72));

await p.$disconnect();
