#!/usr/bin/env node
/**
 * Stage 2 — Baseline `_prisma_migrations` для prod БД після інциденту
 * 2026-05-22.
 *
 * Що робить:
 *  1. Перевіряє кожну міграцію в prisma/migrations/
 *  2. Парсить її DDL — знаходить ім'я CREATE TABLE / ALTER TABLE target
 *  3. Перевіряє: чи відповідна таблиця/колонка УЖЕ існує в БД
 *  4. Якщо ТАК — додає запис у _prisma_migrations (mark applied)
 *  5. Якщо НІ — пропускає (буде застосована через `prisma migrate deploy`)
 *
 * SAFETY:
 *  - Default: DRY RUN (тільки виводить план)
 *  - --confirm — реальний baseline
 *  - НЕ ЗАПУСКАЄ жоден DDL — тільки INSERT у _prisma_migrations
 *
 * Використання:
 *   # DRY RUN (тільки звіт):
 *   DATABASE_URL=<PROD> node scripts/02-baseline-prod-migrations.mjs
 *
 *   # Реальний baseline:
 *   DATABASE_URL=<PROD> node scripts/02-baseline-prod-migrations.mjs --confirm
 */

import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL not set.");
  process.exit(1);
}

const CONFIRM = process.argv.includes("--confirm");
const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

if (!existsSync(MIGRATIONS_DIR)) {
  console.error("❌ prisma/migrations/ not found. Запусти з кореня проєкту.");
  process.exit(1);
}

const masked = url.replace(/:[^:@]+@/, ":****@");
console.log("=".repeat(72));
console.log(CONFIRM ? "🗑️  REAL BASELINE" : "🔍 DRY RUN");
console.log("DB:", masked);
console.log("=".repeat(72));

const p = new PrismaClient({ datasources: { db: { url } } });

// ── 1. Ensure _prisma_migrations exists ─────────────────────────────────────
const tableExists = await p
  .$queryRawUnsafe(
    "SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations'",
  )
  .then((r) => Array.isArray(r) && r.length > 0)
  .catch(() => false);

if (!tableExists) {
  console.log("\n📋 _prisma_migrations table not exists.");
  if (CONFIRM) {
    console.log("   Створюю...");
    await p.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum"              VARCHAR(64) NOT NULL,
        "finished_at"           TIMESTAMPTZ,
        "migration_name"        VARCHAR(255) NOT NULL,
        "logs"                  TEXT,
        "rolled_back_at"        TIMESTAMPTZ,
        "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
      );
    `);
    console.log("   ✅ Створено.");
  } else {
    console.log("   (--confirm щоб створити)");
  }
}

// ── 2. List migrations on disk ─────────────────────────────────────────────
const allDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

console.log(`\n📦 ${allDirs.length} міграцій на диску`);

// ── 3. Find which are already applied ──────────────────────────────────────
const appliedSet = tableExists
  ? new Set(
      (
        await p.$queryRawUnsafe(
          "SELECT migration_name FROM _prisma_migrations",
        )
      ).map((r) => r.migration_name),
    )
  : new Set();

console.log(`   Уже в _prisma_migrations: ${appliedSet.size}`);

// ── 4. Per migration — check if applied, parse DDL, detect presence ────────
async function tableOrColumnExists(migrationSql) {
  // Простий парсер: знаходимо CREATE TABLE / ALTER TABLE ... ADD COLUMN
  // Якщо є хоча б одна таблиця/колонка з міграції — вважаємо застосованою.
  // Не ідеально, але достатньо для baseline (false positives краще
  // за false negatives — bo якщо помилимось, migrate deploy впаде, і
  // ми побачимо). False positives = пропустимо INSERT — теж не страшно
  // (migrate resolve --rolled-back пізніше).

  const tableMatch = migrationSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/i);
  if (tableMatch) {
    const tableName = tableMatch[1];
    const result = await p
      .$queryRawUnsafe(
        `SELECT 1 FROM information_schema.tables WHERE table_name = '${tableName}'`,
      )
      .catch(() => []);
    if (Array.isArray(result) && result.length > 0) {
      return { applied: true, evidence: `table "${tableName}" exists` };
    }
    return { applied: false, evidence: `table "${tableName}" missing` };
  }

  const alterMatch = migrationSql.match(
    /ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/i,
  );
  if (alterMatch) {
    const [, tableName, columnName] = alterMatch;
    const result = await p
      .$queryRawUnsafe(
        `SELECT 1 FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name = '${columnName}'`,
      )
      .catch(() => []);
    if (Array.isArray(result) && result.length > 0) {
      return {
        applied: true,
        evidence: `${tableName}.${columnName} exists`,
      };
    }
    return {
      applied: false,
      evidence: `${tableName}.${columnName} missing`,
    };
  }

  // Інші DDL (CREATE INDEX, DROP, тощо) — не можемо легко перевірити.
  // Вважаємо ALREADY APPLIED, якщо це стара міграція (date < 2026-05-22),
  // інакше — потрібен ручний контроль.
  return { applied: null, evidence: "(інший DDL — потрібен ручний контроль)" };
}

const toMark = [];
const toRun = [];
const ambiguous = [];

console.log("\n🔎 Аналіз міграцій...\n");

for (const dir of allDirs) {
  if (appliedSet.has(dir)) continue; // вже в таблиці

  const migrationPath = join(MIGRATIONS_DIR, dir, "migration.sql");
  if (!existsSync(migrationPath)) continue;

  const sql = readFileSync(migrationPath, "utf8");
  const result = await tableOrColumnExists(sql);

  // Старі (до 2026-05-22 = до інциденту) — точно були застосовані до wipe.
  // Зараз tables ще є (restored), просто історія втрачена.
  const isPreIncident = dir.startsWith("2024") || dir.startsWith("2025") ||
    (dir.startsWith("2026") && dir < "20260522");

  if (result.applied === true) {
    toMark.push({ name: dir, evidence: result.evidence });
  } else if (result.applied === false) {
    toRun.push({ name: dir, evidence: result.evidence });
  } else if (isPreIncident) {
    toMark.push({ name: dir, evidence: "pre-incident migration — assumed applied" });
  } else {
    ambiguous.push({ name: dir, evidence: result.evidence });
  }
}

// ── 5. Report ──────────────────────────────────────────────────────────────
console.log(`✅ ВЖЕ ЗАСТОСОВАНО (mark applied) — ${toMark.length}:`);
toMark.slice(0, 10).forEach((m) => console.log(`   • ${m.name} — ${m.evidence}`));
if (toMark.length > 10) console.log(`   ... +${toMark.length - 10} more`);

console.log(`\n⏳ ПОТРЕБУЮТЬ migrate deploy — ${toRun.length}:`);
toRun.forEach((m) => console.log(`   • ${m.name} — ${m.evidence}`));

console.log(`\n⚠️  AMBIGUOUS (потрібен ручний контроль) — ${ambiguous.length}:`);
ambiguous.forEach((m) => console.log(`   • ${m.name} — ${m.evidence}`));

if (!CONFIRM) {
  console.log("\n" + "=".repeat(72));
  console.log("🔍 DRY RUN — нічого не записано.");
  console.log("Для реального baseline:");
  console.log("   DATABASE_URL=<PROD> node scripts/02-baseline-prod-migrations.mjs --confirm");
  console.log("=".repeat(72));
  await p.$disconnect();
  process.exit(0);
}

// ── 6. INSERT records ──────────────────────────────────────────────────────
console.log(`\n🗑️  Записую ${toMark.length} migrations як applied...`);

for (const m of toMark) {
  const migrationPath = join(MIGRATIONS_DIR, m.name, "migration.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  const exists = await p
    .$queryRawUnsafe(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1`,
      m.name,
    )
    .then((r) => Array.isArray(r) && r.length > 0);

  if (exists) {
    console.log(`   ⏭️  ${m.name} — already recorded`);
    continue;
  }

  await p.$executeRawUnsafe(
    `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
     VALUES ($1, $2, NOW(), $3, NULL, NOW(), 1)`,
    randomUUID(),
    checksum,
    m.name,
  );
  console.log(`   ✅ ${m.name}`);
}

console.log("\n📋 Наступний крок:");
console.log("   DATABASE_URL=<PROD> npx prisma migrate deploy");
console.log("   → застосує лише незастосовані міграції");

await p.$disconnect();
