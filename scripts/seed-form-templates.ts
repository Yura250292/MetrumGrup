/**
 * Seed pre-built form templates (Task 03 — Site Forms Builder).
 *
 * Idempotent: upsert by (name + firmId). Якщо template уже існує і `schema`
 * відрізняється — оновлюємо schema + інкрементимо version + insert revision.
 *
 * Запуск:
 *   npx tsx scripts/seed-form-templates.ts                  → metrum-group
 *   npx tsx scripts/seed-form-templates.ts --firm=metrum-studio
 *   npx tsx scripts/seed-form-templates.ts --dry-run
 *
 * Шаблонів: 6 (DAILY_REPORT, SAFETY, QUALITY, ACCEPTANCE, KB2V, KB3).
 *
 * createdBy: перший SUPER_ADMIN у потрібній фірмі (запитується БД).
 * Якщо такого нема — пропускаємо з warning (admin-засипу не буде).
 */

import { prisma } from "../src/lib/prisma";
import { DEFAULT_FIRM_ID } from "../src/lib/firm/scope";
import type { FormCategory, Prisma } from "@prisma/client";
import type { FormSchema } from "../src/lib/forms/schema";

const DRY_RUN = process.argv.includes("--dry-run");
const firmArg = process.argv.find((a) => a.startsWith("--firm="));
const FIRM_ID = firmArg ? firmArg.split("=")[1] : DEFAULT_FIRM_ID;

type Seed = {
  name: string;
  description: string;
  category: FormCategory;
  schema: FormSchema;
};

const SEEDS: Seed[] = [
  {
    name: "Щоденний рапорт прораба",
    description:
      "Підсумок дня на об'єкті: погода, бригада, виконані роботи, проблеми.",
    category: "DAILY_REPORT",
    schema: {
      fields: [
        { key: "weather", type: "select", label: "Погода", required: true, options: [
          { value: "sun", label: "Сонячно" },
          { value: "cloudy", label: "Хмарно" },
          { value: "rain", label: "Дощ" },
          { value: "snow", label: "Сніг" },
        ] },
        { key: "temperature", type: "number", label: "Температура, °C" },
        { key: "crew_count", type: "number", label: "Чисельність бригади", required: true, min: 0 },
        { key: "work_done", type: "longtext", label: "Виконані роботи", required: true },
        { key: "issues", type: "longtext", label: "Проблеми / зауваження" },
        { key: "photos", type: "photo", label: "Фото з об'єкта", multiple: true },
        { key: "loc", type: "gps", label: "GPS об'єкта" },
        { key: "signature", type: "signature", label: "Підпис прораба", required: true },
      ],
    },
  },
  {
    name: "Інструктаж з охорони праці",
    description: "Журнал ввідних/повторних інструктажів на робочому місці.",
    category: "SAFETY",
    schema: {
      fields: [
        { key: "type", type: "select", label: "Тип інструктажу", required: true, options: [
          { value: "intro", label: "Ввідний" },
          { value: "primary", label: "Первинний" },
          { value: "repeat", label: "Повторний" },
          { value: "target", label: "Цільовий" },
        ] },
        { key: "topic", type: "text", label: "Тема", required: true },
        { key: "instructor_name", type: "text", label: "Прізвище інструктора", required: true },
        { key: "attendee_count", type: "number", label: "Кількість учасників", required: true, min: 1 },
        { key: "attendee_list", type: "longtext", label: "Список учасників (ПІБ)" },
        { key: "date", type: "datetime", label: "Дата та час", required: true },
        { key: "signature", type: "signature", label: "Підпис інструктора", required: true },
      ],
    },
  },
  {
    name: "Інспекція якості робіт",
    description: "Перевірка відповідності виконаних робіт стандартам та проекту.",
    category: "QUALITY",
    schema: {
      fields: [
        { key: "work_type", type: "text", label: "Вид робіт", required: true },
        { key: "result", type: "select", label: "Результат", required: true, options: [
          { value: "pass", label: "Відповідає" },
          { value: "minor", label: "Незначні зауваження" },
          { value: "fail", label: "Не відповідає" },
        ] },
        { key: "issues", type: "longtext", label: "Опис недоліків", visibleIf: { fieldKey: "result", equals: "minor" } },
        { key: "fail_reason", type: "longtext", label: "Причина невідповідності", visibleIf: { fieldKey: "result", equals: "fail" }, required: true },
        { key: "photos", type: "photo", label: "Фото фіксація", multiple: true },
        { key: "signature", type: "signature", label: "Підпис інспектора", required: true },
      ],
    },
  },
  {
    name: "Акт прихованих робіт",
    description:
      "Приймання прихованих робіт перед закриттям наступним шаром (фундамент, ізоляція, армування).",
    category: "ACCEPTANCE",
    schema: {
      fields: [
        { key: "work_description", type: "longtext", label: "Найменування прихованих робіт", required: true },
        { key: "contractor", type: "text", label: "Виконавець (підрядник)", required: true },
        { key: "materials_used", type: "longtext", label: "Використані матеріали" },
        { key: "compliance", type: "checkbox", label: "Виконано згідно з проектом" },
        { key: "permit_to_proceed", type: "checkbox", label: "Дозвіл на продовження робіт", required: true },
        { key: "photos", type: "photo", label: "Фото прихованих робіт", required: true, multiple: true },
        { key: "signature", type: "signature", label: "Підпис відповідального", required: true },
      ],
    },
  },
  {
    name: "Акт виконаних робіт КБ-2в",
    description:
      "Спрощена електронна версія акту КБ-2в (наказ Мінрегіону №65). Точний layout — у Stage 5.",
    category: "KB2V",
    schema: {
      meta: { pdfTemplate: "KB2V" },
      fields: [
        { key: "period_start", type: "date", label: "Період з", required: true },
        { key: "period_end", type: "date", label: "Період по", required: true },
        { key: "object_name", type: "text", label: "Об'єкт", required: true },
        { key: "customer", type: "text", label: "Замовник", required: true },
        { key: "contractor", type: "text", label: "Підрядник", required: true },
        { key: "contract_number", type: "text", label: "Номер договору" },
        { key: "work_list", type: "longtext", label: "Перелік виконаних робіт", required: true },
        { key: "total_amount", type: "number", label: "Загальна вартість, грн", required: true, min: 0 },
        { key: "signature_contractor", type: "signature", label: "Підпис підрядника", required: true },
      ],
    },
  },
  {
    name: "Довідка про вартість КБ-3",
    description: "Спрощена електронна версія КБ-3. Точний layout — у Stage 5.",
    category: "KB3",
    schema: {
      meta: { pdfTemplate: "KB3" },
      fields: [
        { key: "period", type: "text", label: "Звітний період", required: true },
        { key: "object_name", type: "text", label: "Об'єкт", required: true },
        { key: "customer", type: "text", label: "Замовник", required: true },
        { key: "total_amount", type: "number", label: "Загальна сума, грн", required: true, min: 0 },
        { key: "previously_paid", type: "number", label: "Раніше оплачено, грн", min: 0 },
        { key: "current_amount", type: "number", label: "До оплати у звітному періоді, грн", required: true, min: 0 },
        { key: "signature", type: "signature", label: "Підпис керівника", required: true },
      ],
    },
  },
];

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  console.log(`[seed-form-templates] firm=${FIRM_ID} dryRun=${DRY_RUN}`);

  const admin = await prisma.user.findFirst({
    where: { firmId: FIRM_ID, role: "SUPER_ADMIN", isActive: true },
    select: { id: true, name: true },
  });
  if (!admin) {
    console.warn(`[seed-form-templates] жодного SUPER_ADMIN для фірми ${FIRM_ID} — abort`);
    process.exitCode = 1;
    return;
  }
  console.log(`[seed-form-templates] createdBy = ${admin.name} (${admin.id})`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const seed of SEEDS) {
    const existing = await prisma.formTemplate.findFirst({
      where: { firmId: FIRM_ID, name: seed.name },
    });

    if (!existing) {
      console.log(`[create] ${seed.category} · ${seed.name}`);
      if (!DRY_RUN) {
        await prisma.$transaction(async (tx) => {
          const tpl = await tx.formTemplate.create({
            data: {
              firmId: FIRM_ID,
              name: seed.name,
              description: seed.description,
              category: seed.category,
              schema: seed.schema as unknown as Prisma.InputJsonValue,
              version: 1,
              isActive: true,
              createdById: admin.id,
            },
          });
          await tx.formTemplateRevision.create({
            data: {
              templateId: tpl.id,
              version: 1,
              schema: seed.schema as unknown as Prisma.InputJsonValue,
              changeNote: "Pre-built seed",
              createdById: admin.id,
            },
          });
        });
      }
      created += 1;
      continue;
    }

    if (deepEqual(existing.schema, seed.schema)) {
      unchanged += 1;
      continue;
    }

    console.log(`[update] ${seed.category} · ${seed.name} (v${existing.version} → v${existing.version + 1})`);
    if (!DRY_RUN) {
      const newVersion = existing.version + 1;
      await prisma.$transaction(async (tx) => {
        await tx.formTemplate.update({
          where: { id: existing.id },
          data: {
            description: seed.description,
            category: seed.category,
            schema: seed.schema as unknown as Prisma.InputJsonValue,
            version: newVersion,
          },
        });
        await tx.formTemplateRevision.create({
          data: {
            templateId: existing.id,
            version: newVersion,
            schema: seed.schema as unknown as Prisma.InputJsonValue,
            changeNote: "Updated pre-built seed",
            createdById: admin.id,
          },
        });
      });
    }
    updated += 1;
  }

  console.log(
    `[seed-form-templates] done: created=${created} updated=${updated} unchanged=${unchanged}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
