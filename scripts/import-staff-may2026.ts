/**
 * One-shot import: штатний розклад ТзОВ "Метрум Груп" станом на 21.05.2026
 * + зарплати за квітень 2026.
 *
 * Джерела:
 *   - ~/Downloads/Telegram Desktop/Штатний 21.05.26.xls  → 221 активний працівник
 *   - ~/Downloads/Telegram Desktop/зп 30.04.xlsx          → ~115 рядків ЗП з breakdown
 *
 * Запуск:
 *   npx tsx scripts/import-staff-may2026.ts --dry-run
 *   npx tsx scripts/import-staff-may2026.ts
 *
 * Idempotent: match за employeeNumber для штатного і нормалізованим ПІБ для ЗП;
 * EmployeePayrollPeriod має @@unique([employeeId, period]).
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";
import { DEFAULT_FIRM_ID } from "../src/lib/firm/scope";

const DRY_RUN = process.argv.includes("--dry-run");
const PAYROLL_PERIOD = "2026-04";

const STAFF_FILE = path.join(
  os.homedir(),
  "Downloads",
  "Telegram Desktop",
  "Штатний 21.05.26.xls",
);
const SALARY_FILE = path.join(
  os.homedir(),
  "Downloads",
  "Telegram Desktop",
  "зп 30.04.xlsx",
);

// ============================================================
// Утиліти нормалізації
// ============================================================

function unifyApostrophes(s: string): string {
  return s.replace(/['ʼ`´']/g, "'");
}

function toTitleCase(name: string): string {
  // Якщо все в верхньому регістрі (КРИСА МАР'ЯН) → Title Case.
  if (name === name.toUpperCase() && /[А-ЯЁІЇЄҐ]/.test(name)) {
    return name
      .toLowerCase()
      .split(/(\s+|-|')/)
      .map((part) =>
        /\p{L}/u.test(part)
          ? part.charAt(0).toUpperCase() + part.slice(1)
          : part,
      )
      .join("");
  }
  return name;
}

function normalizeName(raw: unknown): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  s = s.replace(/\s+/g, " ");
  s = unifyApostrophes(s);
  s = toTitleCase(s);
  return s;
}

function nameKey(name: string): string {
  // Для fuzzy-match: нижній регістр без апострофів і зайвих пробілів.
  return normalizeName(name).toLowerCase().replace(/['\s]/g, "");
}

// Зменшувальні форми → офіційне ім'я. Покриває типові випадки з ЗП-файлу.
const DIMINUTIVES: Record<string, string> = {
  міша: "михайло",
  бодя: "богдан",
  юра: "юрій",
  володя: "володимир",
  саша: "олександр",
  толя: "анатолій",
  льоша: "олексій",
  сєрьожа: "сергій",
  льоня: "леонід",
  вітя: "віктор",
  ваня: "іван",
  коля: "микола",
  петя: "петро",
  альоша: "олексій",
  гена: "геннадій",
};

// Слова-шум у іменах ЗП-файлу — посади/коментарі, які не належать до ПІБ.
const NOISE_TOKENS = new Set([
  "директор",
  "заступник",
  "прораб",
  "готівка",
  "здається",
]);

function stripParenthetical(s: string): string {
  // "Войтина Богдан Петрович (звільнений у травні)" → "Войтина Богдан Петрович"
  return s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function expandDiminutives(tokens: string[]): string[] {
  return tokens.map((t) => DIMINUTIVES[t] ?? t);
}

function cleanTokens(raw: string): string[] {
  const cleaned = stripParenthetical(raw);
  const tokens = normalizeName(cleaned)
    .toLowerCase()
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NOISE_TOKENS.has(t));
  return expandDiminutives(tokens);
}

function levenshtein1(a: string, b: string): boolean {
  // Чи відстань Левенштейна між a і b ≤1.
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length < b.length) {
      j++;
    } else {
      i++;
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

function tokenKey(name: string): string[] {
  return normalizeName(name)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .sort();
}

function parseUkrDate(s: unknown): Date | null {
  if (s == null) return null;
  const str = String(s).trim();
  if (!str) return null;
  // Формат "DD.MM.YYYY"
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function splitFullName(full: string): {
  lastName: string;
  firstName: string;
  middleName: string;
} {
  const parts = full.split(/\s+/).filter(Boolean);
  return {
    lastName: parts[0] ?? "",
    firstName: parts[1] ?? "",
    middleName: parts.slice(2).join(" "),
  };
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/\s/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ============================================================
// Парсинг штатного розкладу (.xls)
// ============================================================

type StaffRow = {
  employeeNumber: string;
  fullName: string;
  position: string;
  hiredAt: Date | null;
  terminatedAt: Date | null;
  department: "Виробництво" | "Адміністрація";
};

function parseStaffFile(): StaffRow[] {
  const wb = XLSX.readFile(STAFF_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: null,
  });

  const out: StaffRow[] = [];
  let currentDept: StaffRow["department"] = "Виробництво";

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const first = r[0] != null ? String(r[0]).trim() : "";
    const empNumber = r[4] != null ? String(r[4]).trim() : "";

    if (!first) continue;
    if (first === "Основний підрозділ") {
      currentDept = "Виробництво";
      continue;
    }
    if (first === "Адміністрація") {
      currentDept = "Адміністрація";
      continue;
    }
    if (!empNumber) continue; // не запис працівника

    const fullName = normalizeName(first);
    const position = r[6] != null ? String(r[6]).trim() : "";
    const hiredAt = parseUkrDate(r[8]);
    const terminatedAt = parseUkrDate(r[9]);

    out.push({
      employeeNumber: empNumber.padStart(5, "0"),
      fullName,
      position,
      hiredAt,
      terminatedAt,
      department: currentDept,
    });
  }
  return out;
}

// ============================================================
// Парсинг ЗП-файлу (.xlsx)
// ============================================================

type SalaryRow = {
  rawName: string;
  fullName: string;
  brigade: string;
  isVacation: boolean;
  officialPart: number | null;
  pdfo: number | null;
  vz: number | null;
  esv: number | null;
  taxesTotal: number | null;
  salaryToCard: number | null;
  totalSum: number | null;
  advance: number | null;
  sickLeave: number | null;
  vacationPay: number | null;
  bonus: number | null;
  metrumExpenses: number | null;
};

const BRIGADE_NAMES = new Set([
  "Михайло плиточник і його люди",
  "Ткачі (Юра)",
  "Шпак і його люди (Смілка і його люди)",
  "Коля і його люди",
  "Іван Металіст і його людина",
  "Бодя і його людина",
  "Бруківщики (Юра)",
  "Радехівські",
  "Фасадчики (Марʼян)",
  "Штат",
  "Назад",
  "Лікарі",
  "Інші",
]);

function parseSalaryFile(): SalaryRow[] {
  const wb = XLSX.readFile(SALARY_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const out: SalaryRow[] = [];
  let currentBrigade = "Без бригади";

  // Header row — index 0; data починаються з index 1.
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const raw = r[0] != null ? String(r[0]).trim() : "";
    if (!raw) continue;

    // Заголовок бригади: тільки перша колонка має значення, решта null.
    const onlyName = r.slice(1).every((c) => c == null || c === "");
    if (onlyName) {
      const cleaned = unifyApostrophes(raw);
      if (
        BRIGADE_NAMES.has(raw) ||
        BRIGADE_NAMES.has(cleaned) ||
        /^[А-ЯІЇЄҐ][а-яіїєґ\s\(\)ʼ'И]+$/u.test(raw)
      ) {
        currentBrigade = unifyApostrophes(raw);
        continue;
      }
    }

    const pdfoCell = r[2];
    const isVacation =
      typeof pdfoCell === "string" && /відпустка/i.test(pdfoCell);

    out.push({
      rawName: raw,
      fullName: normalizeName(raw),
      brigade: currentBrigade,
      isVacation,
      officialPart: num(r[1]),
      pdfo: isVacation ? null : num(r[2]),
      vz: num(r[3]),
      esv: num(r[4]),
      taxesTotal: num(r[5]),
      salaryToCard: num(r[6]),
      totalSum: num(r[7]),
      advance: num(r[8]),
      sickLeave: num(r[9]),
      vacationPay: num(r[10]),
      bonus: num(r[11]),
      metrumExpenses: num(r[12]),
    });
  }
  return out;
}

// ============================================================
// Зіставлення ЗП-рядків з працівниками штатного
// ============================================================

type MatchConfidence =
  | "exact"
  | "tokens"
  | "diminutive"
  | "initials"
  | "surname-only"
  | "surname-fuzzy"
  | "reordered";

function matchSalary(
  salary: SalaryRow,
  staff: StaffRow[],
): { staff: StaffRow; confidence: MatchConfidence } | null {
  // Pre-clean токени ЗП-рядка: strip "(...)", шум, expand diminutives.
  const sTokens = cleanTokens(salary.rawName);
  if (sTokens.length === 0) return null;

  const sKey = sTokens.slice().sort().join("");

  // 1. Exact — повний нормалізований match за множиною токенів.
  const exact = staff.find((s) => {
    const eTokens = cleanTokens(s.fullName);
    return eTokens.slice().sort().join("") === sKey;
  });
  if (exact) return { staff: exact, confidence: "exact" };

  // 2. Token containment + diminutive (порядок не важливий).
  // Якщо всі токени ЗП-рядка є серед токенів штатного — match (з врахуванням
  // diminutives і reordered-форм типу "Володя Директор Лащук").
  const tokenMatches = staff.filter((emp) => {
    const eTokens = new Set(cleanTokens(emp.fullName));
    return sTokens.every((t) => eTokens.has(t));
  });
  if (tokenMatches.length === 1) {
    return { staff: tokenMatches[0], confidence: "tokens" };
  }

  // 3. Прізвище + ініціал(и) — "Дуткевич А" / "Климчук Т. А.".
  // Перший токен — прізвище; решта — ініціали (1-літерні).
  if (sTokens.length >= 2) {
    const surname = sTokens[0];
    const initials = sTokens.slice(1).filter((t) => t.length === 1);
    if (initials.length > 0 && initials.length === sTokens.length - 1) {
      const candidates = staff.filter((emp) => {
        const e = cleanTokens(emp.fullName);
        if (e[0] !== surname) return false;
        return initials.every((ini, idx) => {
          const part = e[idx + 1];
          return part && part.startsWith(ini);
        });
      });
      if (candidates.length === 1) {
        return { staff: candidates[0], confidence: "initials" };
      }
    }
  }

  // 4. Тільки прізвище — якщо унікальне в штаті.
  if (sTokens.length === 1) {
    const candidates = staff.filter(
      (emp) => cleanTokens(emp.fullName)[0] === sTokens[0],
    );
    if (candidates.length === 1) {
      return { staff: candidates[0], confidence: "surname-only" };
    }
  }

  // 5. Прізвище з опечаткою (Левенштейн ≤1) + перше ім'я співпадає.
  if (sTokens.length >= 2) {
    const sSurname = sTokens[0];
    const sFirst = sTokens[1];
    const candidates = staff.filter((emp) => {
      const e = cleanTokens(emp.fullName);
      return (
        e.length >= 2 &&
        levenshtein1(e[0], sSurname) &&
        (e[1] === sFirst || e[1].startsWith(sFirst.slice(0, 3)))
      );
    });
    if (candidates.length === 1) {
      return { staff: candidates[0], confidence: "surname-fuzzy" };
    }
  }

  return null;
}

// ============================================================
// Основна логіка
// ============================================================

async function main() {
  console.log(`\n=== Import staff + salaries (period ${PAYROLL_PERIOD}) ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no DB writes)" : "WRITE"}\n`);

  const staffRows = parseStaffFile();
  const salaryRows = parseSalaryFile();
  console.log(`Parsed: ${staffRows.length} staff rows, ${salaryRows.length} salary rows\n`);

  // ---- 1. Departments ------------------------------------------------------
  const deptNames: Array<StaffRow["department"]> = ["Виробництво", "Адміністрація"];
  const deptIds = new Map<string, string>();
  let deptCreated = 0;
  for (const name of deptNames) {
    let dep = await prisma.department.findFirst({ where: { name } });
    if (!dep) {
      if (DRY_RUN) {
        console.log(`[DRY] would create Department "${name}"`);
        deptIds.set(name, `dry-${name}`);
        deptCreated++;
        continue;
      }
      dep = await prisma.department.create({ data: { name } });
      deptCreated++;
    }
    deptIds.set(name, dep.id);
  }
  console.log(`Departments: created ${deptCreated}, reused ${deptNames.length - deptCreated}`);

  // ---- 2. Teams (бригади) --------------------------------------------------
  const brigadeSet = new Set(salaryRows.map((s) => s.brigade));
  const teamIds = new Map<string, string>();
  let teamCreated = 0;
  let teamReused = 0;
  for (const name of brigadeSet) {
    if (name === "Без бригади") continue;
    let team = await prisma.team.findFirst({ where: { name } });
    if (!team) {
      if (DRY_RUN) {
        console.log(`[DRY] would create Team "${name}"`);
        teamIds.set(name, `dry-${name}`);
        teamCreated++;
        continue;
      }
      team = await prisma.team.create({ data: { name } });
      teamCreated++;
    } else {
      teamReused++;
    }
    teamIds.set(name, team.id);
  }
  console.log(`Teams: created ${teamCreated}, reused ${teamReused}`);

  // ---- 3. Employees зі штатного --------------------------------------------
  let empCreated = 0;
  let empSkipped = 0;
  const employeeByNumber = new Map<string, { id: string; fullName: string }>();
  const allEmployeesForMatch: StaffRow[] = staffRows;

  for (const row of staffRows) {
    const existing = await prisma.employee.findUnique({
      where: { employeeNumber: row.employeeNumber },
      select: { id: true, fullName: true },
    });
    if (existing) {
      employeeByNumber.set(row.employeeNumber, existing);
      empSkipped++;
      continue;
    }

    const { lastName, firstName, middleName } = splitFullName(row.fullName);
    const data = {
      employeeNumber: row.employeeNumber,
      fullName: row.fullName,
      lastName,
      firstName,
      middleName,
      position: row.position || null,
      hiredAt: row.hiredAt,
      terminatedAt: row.terminatedAt,
      isActive: row.terminatedAt == null,
      departmentId: deptIds.get(row.department) ?? null,
    };

    if (DRY_RUN) {
      console.log(`[DRY] would create Employee ${row.employeeNumber} ${row.fullName} (${row.position})`);
      employeeByNumber.set(row.employeeNumber, {
        id: `dry-${row.employeeNumber}`,
        fullName: row.fullName,
      });
      empCreated++;
      continue;
    }

    const created = await prisma.employee.create({ data });
    employeeByNumber.set(row.employeeNumber, {
      id: created.id,
      fullName: created.fullName,
    });
    empCreated++;
  }
  console.log(`Employees: created ${empCreated}, skipped (already exist) ${empSkipped}`);

  // Map employee by name для match ЗП-рядків
  const employeeByName = new Map<string, { id: string; number: string; fullName: string }>();
  for (const [num, val] of employeeByNumber) {
    employeeByName.set(nameKey(val.fullName), { ...val, number: num });
  }

  // ---- 4. Salary match + payroll periods + team membership ----------------
  let payrollCreated = 0;
  let payrollSkipped = 0;
  let teamMemberCreated = 0;
  const unmatched: SalaryRow[] = [];

  for (const sal of salaryRows) {
    const match = matchSalary(sal, allEmployeesForMatch);
    if (!match) {
      unmatched.push(sal);
      continue;
    }
    const emp = employeeByNumber.get(match.staff.employeeNumber);
    if (!emp) {
      unmatched.push(sal);
      continue;
    }

    // Team membership
    if (sal.brigade !== "Без бригади") {
      const teamId = teamIds.get(sal.brigade);
      if (teamId) {
        if (DRY_RUN) {
          // skip
        } else {
          const existsTm = await prisma.teamMember.findFirst({
            where: { teamId, employeeId: emp.id },
          });
          if (!existsTm) {
            await prisma.teamMember.create({
              data: { teamId, employeeId: emp.id },
            });
            teamMemberCreated++;
          }
        }
      }
    }

    // Payroll period
    const payrollData = {
      employeeId: emp.id,
      firmId: DEFAULT_FIRM_ID,
      period: PAYROLL_PERIOD,
      isVacation: sal.isVacation,
      officialPart: sal.officialPart,
      pdfo: sal.pdfo,
      vz: sal.vz,
      esv: sal.esv,
      taxesTotal: sal.taxesTotal,
      salaryToCard: sal.salaryToCard,
      totalSum: sal.totalSum,
      advance: sal.advance,
      sickLeave: sal.sickLeave,
      vacationPay: sal.vacationPay,
      bonus: sal.bonus,
      metrumExpenses: sal.metrumExpenses,
      sourceFile: "зп 30.04.xlsx",
    };

    if (DRY_RUN) {
      payrollCreated++;
      continue;
    }
    const existing = await prisma.employeePayrollPeriod.findUnique({
      where: {
        employeeId_period: {
          employeeId: emp.id,
          period: PAYROLL_PERIOD,
        },
      },
    });
    if (existing) {
      payrollSkipped++;
    } else {
      await prisma.employeePayrollPeriod.create({ data: payrollData });
      payrollCreated++;
    }
  }

  console.log(`Payroll periods: created ${payrollCreated}, skipped ${payrollSkipped}`);
  console.log(`Team members: created ${teamMemberCreated}`);
  console.log(`Unmatched salary rows: ${unmatched.length}`);

  if (unmatched.length > 0) {
    const csvPath = path.join(process.cwd(), "unmatched-salaries.csv");
    const csv = [
      "rawName,brigade,isVacation,officialPart,salaryToCard,totalSum",
      ...unmatched.map(
        (u) =>
          `"${u.rawName.replace(/"/g, '""')}","${u.brigade.replace(/"/g, '""')}",${u.isVacation},${u.officialPart ?? ""},${u.salaryToCard ?? ""},${u.totalSum ?? ""}`,
      ),
    ].join("\n");
    fs.writeFileSync(csvPath, csv, "utf8");
    console.log(`\nUnmatched written to: ${csvPath}`);
    console.log("\nUnmatched preview:");
    for (const u of unmatched.slice(0, 20)) {
      console.log(`  - "${u.rawName}" (${u.brigade})`);
    }
  }

  console.log("\n✓ Done");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
