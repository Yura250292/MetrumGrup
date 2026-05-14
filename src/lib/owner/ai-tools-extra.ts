/**
 * Розширений набір AI tools для owner-чата (Phase A).
 * Покриває: estimates, payroll/timesheets, materials catalog, KB-2в acts,
 * tasks, employees, project files, foreman reports queue.
 *
 * Усі tools firm-aware (через ProjectId.firmId або Material.firm-...
 * залежно від моделі).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";

interface ToolContext {
  firmId: string | null;
}

const formatUah = (n: number): string =>
  n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });

function firmWhere(firmId: string | null) {
  return firmId ? { firmId } : {};
}

// Helper: обмежує кількість записів і додає суфікс «(показано N з M)»
function paginate<T>(rows: T[], limit: number) {
  return { shown: rows.slice(0, limit), total: rows.length, hasMore: rows.length > limit };
}

// ─── Estimates ────────────────────────────────────────────────────────────

export const QueryEstimatesInput = z.object({
  search: z.string().optional().describe("Назва кошторису або частина"),
  projectIdOrName: z.string().optional().describe("Конкретний проект"),
  status: z.string().optional().describe("DRAFT/SENT/APPROVED/etc"),
  minAmount: z.number().optional().describe("Мінімальна сума"),
  limit: z.number().int().min(1).max(50).default(20),
});

export async function queryEstimates(
  ctx: ToolContext,
  input: z.infer<typeof QueryEstimatesInput>,
): Promise<string> {
  const where: Prisma.EstimateWhereInput = {};
  if (input.search) {
    where.OR = [
      { title: { contains: input.search, mode: "insensitive" } },
      { number: { contains: input.search, mode: "insensitive" } },
    ];
  }
  if (input.projectIdOrName) {
    where.project = {
      OR: [
        { id: input.projectIdOrName },
        { slug: input.projectIdOrName },
        { title: { contains: input.projectIdOrName, mode: "insensitive" } },
      ],
    };
  }
  if (input.status) where.status = input.status as Prisma.EstimateWhereInput["status"];
  if (input.minAmount) where.finalAmount = { gte: input.minAmount };
  if (ctx.firmId) {
    where.project = {
      ...((where.project as Record<string, unknown>) ?? {}),
      firmId: ctx.firmId,
    } as typeof where.project;
  }

  const estimates = await prisma.estimate.findMany({
    where,
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      totalMaterials: true,
      totalLabor: true,
      totalOverhead: true,
      finalAmount: true,
      profitAmount: true,
      profitMarginOverall: true,
      project: { select: { title: true, firmId: true } },
      createdAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit + 1,
  });
  const { shown, hasMore } = paginate(estimates, input.limit);
  if (shown.length === 0) return "Кошторисів за вашими критеріями не знайдено.";

  let md = `**Знайдено ${estimates.length}${hasMore ? "+" : ""} кошторис${shown.length === 1 ? "" : "ів"}**\n\n`;
  md += `| № | Назва | Проект | Статус | Матер. | Робота | Прибуток | Сума |\n|---|---|---|---|---:|---:|---:|---:|\n`;
  for (const e of shown) {
    md += `| ${e.number} | ${e.title} | ${e.project?.title ?? "—"} | ${e.status} | ${formatUah(Number(e.totalMaterials))} | ${formatUah(Number(e.totalLabor))} | ${formatUah(Number(e.profitAmount))} | **${formatUah(Number(e.finalAmount))}** |\n`;
  }
  return md;
}

// ─── Payroll: timesheets + salaries ───────────────────────────────────────

export const QueryPayrollInput = z.object({
  employeeName: z.string().optional().describe("Прізвище або імʼя"),
  fromDate: z.string().optional().describe("YYYY-MM-DD"),
  toDate: z.string().optional().describe("YYYY-MM-DD"),
  projectIdOrName: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export async function queryPayroll(
  ctx: ToolContext,
  input: z.infer<typeof QueryPayrollInput>,
): Promise<string> {
  const where: Prisma.TimesheetWhereInput = {};
  if (input.fromDate || input.toDate) {
    where.date = {};
    if (input.fromDate) (where.date as Prisma.DateTimeFilter).gte = new Date(input.fromDate);
    if (input.toDate) (where.date as Prisma.DateTimeFilter).lte = new Date(input.toDate);
  }
  if (input.employeeName) {
    where.OR = [
      {
        employee: {
          OR: [
            { fullName: { contains: input.employeeName, mode: "insensitive" } },
            { lastName: { contains: input.employeeName, mode: "insensitive" } },
            { firstName: { contains: input.employeeName, mode: "insensitive" } },
          ],
        },
      },
      {
        worker: {
          name: { contains: input.employeeName, mode: "insensitive" },
        },
      },
    ];
  }
  if (input.projectIdOrName) {
    where.project = {
      OR: [
        { id: input.projectIdOrName },
        { slug: input.projectIdOrName },
        { title: { contains: input.projectIdOrName, mode: "insensitive" } },
      ],
    };
  }
  if (ctx.firmId) {
    where.project = {
      ...((where.project as Record<string, unknown>) ?? {}),
      firmId: ctx.firmId,
    } as typeof where.project;
  }

  const timesheets = await prisma.timesheet.findMany({
    where,
    select: {
      date: true,
      hours: true,
      hourlyRate: true,
      amount: true,
      approvedAt: true,
      employee: { select: { fullName: true } },
      worker: { select: { name: true } },
      project: { select: { title: true } },
    },
    orderBy: { date: "desc" },
    take: input.limit,
  });
  if (timesheets.length === 0) return "Записів робочого часу не знайдено.";

  const totalAmount = timesheets.reduce((s, t) => s + Number(t.amount), 0);
  const totalHours = timesheets.reduce((s, t) => s + Number(t.hours), 0);

  // Aggregate by employee
  const byPerson = new Map<string, { hours: number; amount: number }>();
  for (const t of timesheets) {
    const key = t.employee?.fullName ?? t.worker?.name ?? "—";
    const cur = byPerson.get(key) ?? { hours: 0, amount: 0 };
    cur.hours += Number(t.hours);
    cur.amount += Number(t.amount);
    byPerson.set(key, cur);
  }

  let md = `**Зарплати за період${input.fromDate || input.toDate ? ` ${input.fromDate ?? "початок"} – ${input.toDate ?? "сьогодні"}` : ""}**\n\n`;
  md += `- Всього годин: **${totalHours.toFixed(1)}**\n`;
  md += `- Всього нараховано: **${formatUah(totalAmount)} грн**\n`;
  md += `- Записів: ${timesheets.length}\n\n`;

  if (byPerson.size > 1) {
    md += `### По людях\n\n| Працівник | Год | Сума |\n|---|---:|---:|\n`;
    for (const [name, v] of Array.from(byPerson.entries()).sort((a, b) => b[1].amount - a[1].amount)) {
      md += `| ${name} | ${v.hours.toFixed(1)} | ${formatUah(v.amount)} |\n`;
    }
    md += `\n`;
  }

  md += `### Деталі (топ ${Math.min(20, timesheets.length)})\n\n`;
  md += `| Дата | Працівник | Проект | Год | Ставка | Сума |\n|---|---|---|---:|---:|---:|\n`;
  for (const t of timesheets.slice(0, 20)) {
    const name = t.employee?.fullName ?? t.worker?.name ?? "—";
    md += `| ${t.date.toISOString().slice(0, 10)} | ${name} | ${t.project?.title ?? "—"} | ${Number(t.hours).toFixed(1)} | ${formatUah(Number(t.hourlyRate))} | ${formatUah(Number(t.amount))} |\n`;
  }
  return md;
}

// ─── Employees ─────────────────────────────────────────────────────────────

export const QueryEmployeesInput = z.object({
  search: z.string().optional().describe("Прізвище/імʼя/посада"),
  active: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(30),
});

export async function queryEmployees(
  _ctx: ToolContext,
  input: z.infer<typeof QueryEmployeesInput>,
): Promise<string> {
  const where: Prisma.EmployeeWhereInput = {};
  if (input.active !== undefined) where.isActive = input.active;
  if (input.search) {
    where.OR = [
      { fullName: { contains: input.search, mode: "insensitive" } },
      { position: { contains: input.search, mode: "insensitive" } },
      { lastName: { contains: input.search, mode: "insensitive" } },
      { firstName: { contains: input.search, mode: "insensitive" } },
    ];
  }
  const employees = await prisma.employee.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      position: true,
      phone: true,
      email: true,
      hiredAt: true,
      isActive: true,
      department: { select: { name: true } },
      salaries: {
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { baseSalary: true, coefficient: true },
      },
    },
    orderBy: { fullName: "asc" },
    take: input.limit + 1,
  });
  if (employees.length === 0) return "Співробітників не знайдено.";

  const { shown, hasMore } = paginate(employees, input.limit);
  let md = `**Співробітники (${employees.length}${hasMore ? "+" : ""})**\n\n`;
  md += `| ПІБ | Посада | Підрозділ | Телефон | Оклад | Активний |\n|---|---|---|---|---:|---|\n`;
  for (const e of shown) {
    const lastSalary = e.salaries[0];
    const total = lastSalary ? Number(lastSalary.baseSalary) + Number(lastSalary.coefficient) : null;
    md += `| ${e.fullName} | ${e.position ?? "—"} | ${e.department?.name ?? "—"} | ${e.phone ?? "—"} | ${total ? formatUah(total) : "—"} | ${e.isActive ? "✓" : "—"} |\n`;
  }
  return md;
}

// ─── Materials catalog ─────────────────────────────────────────────────────

export const QueryMaterialsInput = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export async function queryMaterials(
  _ctx: ToolContext,
  input: z.infer<typeof QueryMaterialsInput>,
): Promise<string> {
  const where: Prisma.MaterialWhereInput = { isActive: true };
  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: "insensitive" } },
      { sku: { contains: input.search, mode: "insensitive" } },
    ];
  }
  if (input.category) where.category = { contains: input.category, mode: "insensitive" };
  const materials = await prisma.material.findMany({
    where,
    select: { id: true, sku: true, name: true, category: true, unit: true, basePrice: true, laborRate: true },
    orderBy: { name: "asc" },
    take: input.limit + 1,
  });
  if (materials.length === 0) return "Матеріалів у каталозі не знайдено.";

  const { shown, hasMore } = paginate(materials, input.limit);
  let md = `**Каталог матеріалів (${materials.length}${hasMore ? "+" : ""})**\n\n`;
  md += `| SKU | Назва | Категорія | Од. | Ціна | Робота |\n|---|---|---|---|---:|---:|\n`;
  for (const m of shown) {
    md += `| \`${m.sku}\` | ${m.name} | ${m.category} | ${m.unit} | ${formatUah(Number(m.basePrice))} | ${formatUah(Number(m.laborRate))} |\n`;
  }
  return md;
}

// ─── KB-2в acts ────────────────────────────────────────────────────────────

export const QueryKB2vInput = z.object({
  projectIdOrName: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export async function queryKB2v(
  ctx: ToolContext,
  input: z.infer<typeof QueryKB2vInput>,
): Promise<string> {
  const where: Prisma.KB2FormWhereInput = {};
  if (input.fromDate || input.toDate) {
    where.periodFrom = {};
    if (input.fromDate) (where.periodFrom as Prisma.DateTimeFilter).gte = new Date(input.fromDate);
    if (input.toDate) (where.periodFrom as Prisma.DateTimeFilter).lte = new Date(input.toDate);
  }
  if (input.projectIdOrName) {
    where.project = {
      OR: [
        { id: input.projectIdOrName },
        { slug: input.projectIdOrName },
        { title: { contains: input.projectIdOrName, mode: "insensitive" } },
      ],
    };
  }
  if (ctx.firmId) {
    where.project = {
      ...((where.project as Record<string, unknown>) ?? {}),
      firmId: ctx.firmId,
    } as typeof where.project;
  }
  const forms = await prisma.kB2Form.findMany({
    where,
    select: {
      id: true,
      number: true,
      periodFrom: true,
      periodTo: true,
      totalAmount: true,
      retentionPercent: true,
      status: true,
      project: { select: { title: true } },
      counterparty: { select: { name: true } },
    },
    orderBy: { periodFrom: "desc" },
    take: input.limit + 1,
  });
  if (forms.length === 0) return "Актів КБ-2в не знайдено.";
  const { shown, hasMore } = paginate(forms, input.limit);
  const total = forms.reduce((s, f) => s + Number(f.totalAmount), 0);

  let md = `**Акти КБ-2в (${forms.length}${hasMore ? "+" : ""})**\n\n`;
  md += `Загальна сума: **${formatUah(total)} грн**\n\n`;
  md += `| № | Період | Проект | Контрагент | Утримання % | Статус | Сума |\n|---|---|---|---|---:|---|---:|\n`;
  for (const f of shown) {
    md += `| ${f.number} | ${f.periodFrom.toISOString().slice(0, 10)} – ${f.periodTo.toISOString().slice(0, 10)} | ${f.project?.title ?? "—"} | ${f.counterparty?.name ?? "—"} | ${Number(f.retentionPercent).toFixed(0)}% | ${f.status} | **${formatUah(Number(f.totalAmount))}** |\n`;
  }
  return md;
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

export const QueryTasksInput = z.object({
  projectIdOrName: z.string().optional(),
  status: z.string().optional().describe("Назва статусу — будь-яка нечутлива до регістру"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  overdueOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(30),
});

export async function queryTasks(
  ctx: ToolContext,
  input: z.infer<typeof QueryTasksInput>,
): Promise<string> {
  const where: Prisma.TaskWhereInput = {};
  if (input.projectIdOrName) {
    where.project = {
      OR: [
        { id: input.projectIdOrName },
        { slug: input.projectIdOrName },
        { title: { contains: input.projectIdOrName, mode: "insensitive" } },
      ],
    };
  }
  if (ctx.firmId) {
    where.project = {
      ...((where.project as Record<string, unknown>) ?? {}),
      firmId: ctx.firmId,
    } as typeof where.project;
  }
  if (input.priority) where.priority = input.priority;
  if (input.status) {
    where.status = { name: { contains: input.status, mode: "insensitive" } };
  }
  if (input.overdueOnly) {
    where.dueDate = { lt: new Date() };
    where.completedAt = null;
  }
  const tasks = await prisma.task.findMany({
    where,
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      completedAt: true,
      estimatedHours: true,
      actualHours: true,
      status: { select: { name: true } },
      project: { select: { title: true } },
      assignees: {
        select: {
          user: { select: { name: true } },
          employee: { select: { fullName: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    take: input.limit + 1,
  });
  if (tasks.length === 0) return "Задач не знайдено.";
  const { shown, hasMore } = paginate(tasks, input.limit);

  let md = `**Задачі (${tasks.length}${hasMore ? "+" : ""})**\n\n`;
  md += `| Задача | Проект | Статус | Пріор. | Дедлайн | Виконавці | Год план/факт |\n|---|---|---|---|---|---|---:|\n`;
  for (const t of shown) {
    const overdue = t.dueDate && t.dueDate < new Date() && !t.completedAt ? " ⚠️" : "";
    const assignees =
      t.assignees
        .map((a) => a.user?.name ?? a.employee?.fullName ?? "")
        .filter(Boolean)
        .join(", ") || "—";
    md += `| ${t.title} | ${t.project?.title ?? "—"} | ${t.status?.name ?? "—"} | ${t.priority} | ${t.dueDate ? t.dueDate.toISOString().slice(0, 10) + overdue : "—"} | ${assignees} | ${Number(t.estimatedHours ?? 0)}/${Number(t.actualHours)} |\n`;
  }
  return md;
}

// ─── Foreman reports queue ─────────────────────────────────────────────────

export const QueryForemanReportsInput = z.object({
  status: z
    .enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"])
    .optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export async function queryForemanReports(
  ctx: ToolContext,
  input: z.infer<typeof QueryForemanReportsInput>,
): Promise<string> {
  const where: Prisma.ForemanReportWhereInput = { ...firmWhere(ctx.firmId) };
  if (input.status) where.status = input.status;
  if (input.fromDate || input.toDate) {
    where.occurredAt = {};
    if (input.fromDate) (where.occurredAt as Prisma.DateTimeFilter).gte = new Date(input.fromDate);
    if (input.toDate) (where.occurredAt as Prisma.DateTimeFilter).lte = new Date(input.toDate);
  }
  const reports = await prisma.foremanReport.findMany({
    where,
    select: {
      id: true,
      status: true,
      occurredAt: true,
      submittedAt: true,
      project: { select: { title: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true, attachments: true } },
      items: { select: { amount: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: input.limit + 1,
  });
  if (reports.length === 0) return "Звітів виконробів не знайдено.";
  const { shown, hasMore } = paginate(reports, input.limit);

  const totalShown = shown.reduce(
    (s, r) => s + r.items.reduce((ss, i) => ss + Number(i.amount), 0),
    0,
  );

  let md = `**Звіти виконробів (${reports.length}${hasMore ? "+" : ""})**\n\n`;
  md += `Сума показаних: **${formatUah(totalShown)} грн**\n\n`;
  md += `| Дата | Виконроб | Проект | Статус | Поз. | 📎 | Сума |\n|---|---|---|---|---:|---:|---:|\n`;
  for (const r of shown) {
    const sum = r.items.reduce((s, i) => s + Number(i.amount), 0);
    md += `| ${r.occurredAt.toISOString().slice(0, 10)} | ${r.createdBy.name} | ${r.project.title} | ${r.status} | ${r._count.items} | ${r._count.attachments || ""} | **${formatUah(sum)}** |\n`;
  }
  return md;
}

// ─── Project files ─────────────────────────────────────────────────────────

export const QueryProjectFilesInput = z.object({
  projectIdOrName: z.string(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export async function queryProjectFiles(
  ctx: ToolContext,
  input: z.infer<typeof QueryProjectFilesInput>,
): Promise<string> {
  const project = await prisma.project.findFirst({
    where: {
      ...firmWhere(ctx.firmId),
      OR: [
        { id: input.projectIdOrName },
        { slug: input.projectIdOrName },
        { title: { contains: input.projectIdOrName, mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true },
  });
  if (!project) return `Проект «${input.projectIdOrName}» не знайдено.`;

  const where: Prisma.ProjectFileWhereInput = { projectId: project.id };
  if (input.category) where.category = input.category as Prisma.ProjectFileWhereInput["category"];

  const files = await prisma.projectFile.findMany({
    where,
    select: {
      id: true,
      name: true,
      category: true,
      type: true,
      size: true,
      mimeType: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
  });
  if (files.length === 0) return `У проекті «${project.title}» файлів немає.`;
  const { shown, hasMore } = paginate(files, input.limit);

  let md = `**Файли проекту «${project.title}» (${files.length}${hasMore ? "+" : ""})**\n\n`;
  md += `| Дата | Назва | Категорія | Тип | Розмір КБ | Завантажив |\n|---|---|---|---|---:|---|\n`;
  for (const f of shown) {
    md += `| ${f.createdAt.toISOString().slice(0, 10)} | ${f.name} | ${f.category} | ${f.type} | ${(f.size / 1024).toFixed(0)} | ${f.uploadedBy?.name ?? "—"} |\n`;
  }
  return md;
}

// ─── Tools manifest ────────────────────────────────────────────────────────

export const EXTRA_TOOLS = [
  {
    name: "query_estimates",
    description:
      "Пошук кошторисів за назвою/проектом/статусом/мін.сумою. Повертає таблицю з матеріалами/роботою/прибутком/фінальною сумою.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string" },
        projectIdOrName: { type: "string" },
        status: { type: "string" },
        minAmount: { type: "number" },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "query_payroll",
    description:
      "Записи робочого часу (Timesheet) з ставкою і нарахованою сумою. Можна фільтрувати по працівнику (ПІБ), даті, проекту. Агрегує по людях.",
    input_schema: {
      type: "object",
      properties: {
        employeeName: { type: "string" },
        fromDate: { type: "string" },
        toDate: { type: "string" },
        projectIdOrName: { type: "string" },
        limit: { type: "number", default: 30 },
      },
    },
  },
  {
    name: "query_employees",
    description:
      "Список співробітників з посадою, відділом, телефоном, останнім окладом. Пошук по ПІБ або посаді.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string" },
        active: { type: "boolean", default: true },
        limit: { type: "number", default: 30 },
      },
    },
  },
  {
    name: "query_materials",
    description:
      "Каталог матеріалів (Material) з SKU, ціною за од., ставкою робіт. Пошук по назві/SKU/категорії.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string" },
        category: { type: "string" },
        limit: { type: "number", default: 30 },
      },
    },
  },
  {
    name: "query_kb2v",
    description:
      "Акти приймання робіт КБ-2в. Можна фільтрувати по проекту і періоду. Показує контрагента, утримання, статус, суму.",
    input_schema: {
      type: "object",
      properties: {
        projectIdOrName: { type: "string" },
        fromDate: { type: "string" },
        toDate: { type: "string" },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "query_tasks",
    description:
      "Задачі (Task) проектів. Можна фільтрувати по проекту, статусу, пріоритету або тільки прострочені (overdueOnly=true). Показує виконавців і дедлайни.",
    input_schema: {
      type: "object",
      properties: {
        projectIdOrName: { type: "string" },
        status: { type: "string" },
        priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
        overdueOnly: { type: "boolean", default: false },
        limit: { type: "number", default: 30 },
      },
    },
  },
  {
    name: "query_foreman_reports",
    description:
      "Звіти виконробів про витрати з об'єкту. Показує статус (DRAFT/PENDING_APPROVAL/APPROVED/REJECTED/CANCELLED), ким подано, кількість позицій, суму.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"] },
        fromDate: { type: "string" },
        toDate: { type: "string" },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "query_project_files",
    description:
      "Файли і документи проекту (договори, КС-2/КС-3, фото, креслення, інше). Можна фільтрувати по категорії.",
    input_schema: {
      type: "object",
      properties: {
        projectIdOrName: { type: "string" },
        category: { type: "string" },
        limit: { type: "number", default: 20 },
      },
      required: ["projectIdOrName"],
    },
  },
];

export async function dispatchExtraTool(
  ctx: ToolContext,
  name: string,
  input: unknown,
): Promise<string | null> {
  try {
    switch (name) {
      case "query_estimates":
        return await queryEstimates(ctx, QueryEstimatesInput.parse(input));
      case "query_payroll":
        return await queryPayroll(ctx, QueryPayrollInput.parse(input));
      case "query_employees":
        return await queryEmployees(ctx, QueryEmployeesInput.parse(input));
      case "query_materials":
        return await queryMaterials(ctx, QueryMaterialsInput.parse(input));
      case "query_kb2v":
        return await queryKB2v(ctx, QueryKB2vInput.parse(input));
      case "query_tasks":
        return await queryTasks(ctx, QueryTasksInput.parse(input));
      case "query_foreman_reports":
        return await queryForemanReports(ctx, QueryForemanReportsInput.parse(input));
      case "query_project_files":
        return await queryProjectFiles(ctx, QueryProjectFilesInput.parse(input));
      default:
        return null; // Не наш tool
    }
  } catch (e) {
    return `Помилка виконання ${name}: ${e instanceof Error ? e.message : String(e)}`;
  }
}
