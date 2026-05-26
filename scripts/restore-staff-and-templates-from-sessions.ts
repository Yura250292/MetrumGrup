/**
 * One-off restore: персонал + EmployeeSalary + FinanceExpenseTemplate
 * за даними витягнутими з Claude-сесій до інциденту 2026-05-22.
 *
 * Що робить:
 *  1. Створює 7 нових Employee (бухгалтерія / маркетинг / нові співробітники)
 *     яких немає у штатному файлі 1С — ймовірно бо вони на ЦПХ або
 *     поза основним штатом.
 *  2. Створює EmployeeSalary для 5 співробітників з відомими цифрами
 *     (effectiveFrom=2026-05-01 — ЗП на травень 2026).
 *  3. Створює FinanceExpenseTemplate "Оренда офіс 81 000 грн/міс" у папці
 *     "Витрати офісу > Постійні".
 *  4. Створює FinanceExpenseTemplate "ЗП готівка Маркетинг 25 000 грн/міс"
 *     у папці "Постійні витрати".
 *
 * Не створює FinanceEntry — користувач сам тиcкне "Apply" у PayrollModal /
 * TemplateConstructor щоб згенерувати фактичні записи за період.
 *
 * Запуск:
 *   npx tsx scripts/restore-staff-and-templates-from-sessions.ts --dry-run
 *   npx tsx scripts/restore-staff-and-templates-from-sessions.ts
 */
import { prisma } from "../src/lib/prisma";

const DRY = process.argv.includes("--dry-run");
const CREATOR_EMAIL = "ufedishin@gmail.com";
const EFFECTIVE_FROM = new Date("2026-05-01T00:00:00.000Z");
const FOLDER_OFFICE_FIXED = "fld_sys_office_fixed"; // "Витрати офісу > Постійні"
const FOLDER_PERMANENT = "fld_sys_company_expenses"; // "Постійні витрати"
const FIRM_ID = "metrum-group";

// 7 нових Employee — бухгалтерія, маркетинг, інше поза основним штатом 1С.
const NEW_EMPLOYEES = [
  { lastName: "Чорна",      firstName: "Лідія",        middleName: null,             position: "Головний бухгалтер" },
  { lastName: "Шуневич",    firstName: "Анастасія",    middleName: "Віталіївна",     position: "Бухгалтер / адмін" },
  { lastName: "Пехник",     firstName: "Христина",     middleName: "Андріївна",      position: "Адміністрація" },
  { lastName: "Гетьманська", firstName: "Юлія-Марія",  middleName: "Володимирівна",  position: "Адміністрація" },
  { lastName: "Ярема",      firstName: "Оксана",       middleName: null,             position: "Адміністрація" },
  { lastName: "Марко",      firstName: "Денис",        middleName: "Романович",      position: "Адміністрація" },
  { lastName: "Валєра",     firstName: "—",            middleName: null,             position: "Адміністрація" }, // ПІБ невідомі
];

// ЗП для 5 з відомими цифрами (від 2026-05-01).
const SALARIES: Array<{ matchFullName: string; baseSalary: number; description: string }> = [
  { matchFullName: "Стецький Сергій Володимирович",  baseSalary: 88000, description: "ЗП Стецький — план травень 2026 (відновлено з історії сесій)" },
  { matchFullName: "Шиба Ігор Олегович",             baseSalary: 38500, description: "ЗП Шиба — план травень 2026 (відновлено з історії сесій)" },
  { matchFullName: "Радзівон Юрій Степанович",       baseSalary: 38500, description: "ЗП Радзівон — план травень 2026 (відновлено з історії сесій)" },
  { matchFullName: "Чорна Лідія",                    baseSalary: 45000, description: "ЗП Чорна Лідія — план травень 2026 (відновлено з історії сесій)" },
  { matchFullName: "Шуневич Анастасія Віталіївна",   baseSalary: 25000, description: "ЗП Шуневич — план травень 2026 (відновлено з історії сесій)" },
];

async function main() {
  console.log(`\n=== ${DRY ? "🔍 DRY-RUN" : "🚀 APPLY"} ===\n`);
  const creator = await prisma.user.findUnique({ where: { email: CREATOR_EMAIL } });
  if (!creator) throw new Error(`User ${CREATOR_EMAIL} not found`);
  console.log(`Author: ${creator.name} (${creator.id})`);

  const adminDept = await prisma.department.findFirst({ where: { name: { contains: "Адмін", mode: "insensitive" } } });
  if (!adminDept) throw new Error("Department 'Адміністрація' not found");
  console.log(`Department: ${adminDept.name} (${adminDept.id})\n`);

  // 1) Create 7 new Employee
  console.log("=== 1. Створення нових Employee ===");
  const createdEmps: Array<{ id: string; fullName: string }> = [];
  for (const e of NEW_EMPLOYEES) {
    const fullName = `${e.lastName} ${e.firstName}${e.middleName ? " " + e.middleName : ""}`.trim();
    const exists = await prisma.employee.findFirst({ where: { fullName } });
    if (exists) { console.log(`  ⏭  ${fullName} вже існує (${exists.id})`); createdEmps.push({ id: exists.id, fullName }); continue; }
    if (DRY) { console.log(`  📝 [DRY] створив би: ${fullName}`); continue; }
    const emp = await prisma.employee.create({
      data: {
        lastName: e.lastName,
        firstName: e.firstName,
        middleName: e.middleName,
        fullName,
        position: e.position,
        departmentId: adminDept.id,
        isActive: true,
        employmentType: "CONTRACT", // бухгалтерія/маркетинг — ЦПХ, не штат 1С
        hiredAt: new Date("2025-01-01T00:00:00.000Z"), // невідомо точно
      },
    });
    createdEmps.push({ id: emp.id, fullName });
    console.log(`  ✅ ${fullName} → ${emp.id}`);
  }

  // 2) Create EmployeeSalary
  console.log("\n=== 2. Створення EmployeeSalary ===");
  for (const s of SALARIES) {
    const emp = await prisma.employee.findFirst({ where: { fullName: { contains: s.matchFullName, mode: "insensitive" } } });
    if (!emp) { console.log(`  ❌ Employee не знайдено: ${s.matchFullName}`); continue; }
    const existing = await prisma.employeeSalary.findFirst({ where: { employeeId: emp.id, effectiveTo: null } });
    if (existing) { console.log(`  ⏭  ${s.matchFullName} вже має активну ЗП ${existing.baseSalary} (skip)`); continue; }
    if (DRY) { console.log(`  📝 [DRY] ${emp.fullName} → ${s.baseSalary} грн/міс`); continue; }
    await prisma.employeeSalary.create({
      data: {
        employeeId: emp.id,
        baseSalary: s.baseSalary,
        coefficient: 0,
        description: s.description,
        effectiveFrom: EFFECTIVE_FROM,
        currency: "UAH",
      },
    });
    console.log(`  ✅ ${emp.fullName} → ${s.baseSalary} грн/міс`);
  }

  // 3) FinanceExpenseTemplate "Оренда офіс" 81 000
  console.log("\n=== 3. FinanceExpenseTemplate: Оренда офіс ===");
  const rentExists = await prisma.financeExpenseTemplate.findFirst({ where: { folderId: FOLDER_OFFICE_FIXED, name: "Оренда офіс" } });
  if (rentExists) console.log(`  ⏭  Шаблон вже існує (${rentExists.id})`);
  else if (DRY) console.log(`  📝 [DRY] Оренда офіс — 81 000 грн/міс у "${FOLDER_OFFICE_FIXED}"`);
  else {
    const t = await prisma.financeExpenseTemplate.create({
      data: {
        folderId: FOLDER_OFFICE_FIXED,
        name: "Оренда офіс",
        defaultAmount: 81000,
        type: "EXPENSE",
        category: "rent",
        description: "Місячна оренда офісу (відновлено з історії 04.2026)",
        emoji: "🏢",
        sortOrder: 0,
        isActive: true,
        createdById: creator.id,
      },
    });
    console.log(`  ✅ ${t.id} → Оренда офіс 81 000 грн`);
  }

  // 4) FinanceExpenseTemplate "ЗП готівка Маркетинг" 25 000
  console.log("\n=== 4. FinanceExpenseTemplate: ЗП готівка Маркетинг ===");
  const mktExists = await prisma.financeExpenseTemplate.findFirst({ where: { folderId: FOLDER_PERMANENT, name: { contains: "Маркетинг" } } });
  if (mktExists) console.log(`  ⏭  Шаблон вже існує (${mktExists.id})`);
  else if (DRY) console.log(`  📝 [DRY] ЗП готівка Маркетинг — 25 000 грн/міс у "${FOLDER_PERMANENT}"`);
  else {
    const t = await prisma.financeExpenseTemplate.create({
      data: {
        folderId: FOLDER_PERMANENT,
        name: "ЗП готівка Маркетинг",
        defaultAmount: 25000,
        type: "EXPENSE",
        category: "salary",
        description: "Готівкова ЗП — collective Маркетинг (відновлено з історії 04.2026)",
        emoji: "📣",
        sortOrder: 10,
        isActive: true,
        createdById: creator.id,
      },
    });
    console.log(`  ✅ ${t.id} → ЗП готівка Маркетинг 25 000 грн`);
  }

  console.log(`\n${DRY ? "💡 Це був DRY-RUN. Запусти без --dry-run щоб записати." : "✅ Готово."}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
