import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * AI tools для owner-чату. Кожен tool — типізована функція що повертає
 * структуровані дані (рядок markdown / table / JSON). Claude Sonnet викликає
 * їх через tool_use. Усі firm-aware: scope беремо з активної фірми (null = усі).
 */

interface ToolContext {
  firmId: string | null;
}

function firmWhere(firmId: string | null): { firmId?: string } {
  return firmId ? { firmId } : {};
}

const formatUah = (n: number): string =>
  n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });

// ─── Tool 1: Counterparty balance ─────────────────────────────────────────

export const QueryCounterpartyBalanceInput = z.object({
  name: z
    .string()
    .min(1)
    .describe("Імʼя або частина імені контрагента (наприклад 'Михайло', 'Кудрик', 'Епіцентр')"),
});

export async function queryCounterpartyBalance(
  ctx: ToolContext,
  input: z.infer<typeof QueryCounterpartyBalanceInput>,
): Promise<string> {
  const where = firmWhere(ctx.firmId);
  const counterparties = await prisma.counterparty.findMany({
    where: {
      ...where,
      OR: [
        { name: { contains: input.name, mode: "insensitive" } },
        { displayName: { contains: input.name, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, displayName: true, type: true, firmId: true },
    take: 10,
  });

  if (counterparties.length === 0) {
    // Fallback: шукаємо по counterparty string у FinanceEntry (legacy)
    const entries = await prisma.financeEntry.findMany({
      where: {
        ...where,
        counterparty: { contains: input.name, mode: "insensitive" },
        kind: "FACT",
        type: "EXPENSE",
        isArchived: false,
      },
      select: { counterparty: true, amount: true, status: true, occurredAt: true, project: { select: { title: true } } },
      orderBy: { occurredAt: "desc" },
      take: 30,
    });
    if (entries.length === 0) {
      return `Контрагента «${input.name}» не знайдено ні у книзі контрагентів, ні у легасі-полі counterparty.`;
    }
    const total = entries.reduce((s, e) => s + Number(e.amount), 0);
    const unpaid = entries
      .filter((e) => e.status !== "PAID")
      .reduce((s, e) => s + Number(e.amount), 0);
    let md = `**Знайдено по фрі-стрінгу «${input.name}»** (${entries.length} записів)\n\n`;
    md += `- Всього: **${formatUah(total)} грн**\n`;
    md += `- Несплачено: **${formatUah(unpaid)} грн**\n\n`;
    md += `| Дата | Проект | Контрагент | Статус | Сума |\n|---|---|---|---|---:|\n`;
    for (const e of entries.slice(0, 15)) {
      md += `| ${e.occurredAt.toISOString().slice(0, 10)} | ${e.project?.title ?? "—"} | ${e.counterparty ?? "—"} | ${e.status} | ${formatUah(Number(e.amount))} |\n`;
    }
    return md;
  }

  // Точний counterparty(s) знайдено — порахуємо детально
  const cpIds = counterparties.map((c) => c.id);
  const entries = await prisma.financeEntry.findMany({
    where: {
      counterpartyId: { in: cpIds },
      kind: "FACT",
      type: "EXPENSE",
      isArchived: false,
    },
    select: {
      amount: true,
      status: true,
      occurredAt: true,
      title: true,
      counterpartyId: true,
      counterpartyEntity: { select: { name: true } },
      project: { select: { title: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });
  const total = entries.reduce((s, e) => s + Number(e.amount), 0);
  const unpaid = entries
    .filter((e) => e.status !== "PAID")
    .reduce((s, e) => s + Number(e.amount), 0);

  let md = `**Контрагент(и):** ${counterparties.map((c) => c.displayName ?? c.name).join(", ")}\n\n`;
  md += `- Записів: **${entries.length}**\n`;
  md += `- Всього нараховано: **${formatUah(total)} грн**\n`;
  md += `- Несплачено: **${formatUah(unpaid)} грн**${unpaid > 0 ? " ⚠️" : " ✓"}\n\n`;
  if (entries.length > 0) {
    md += `### Останні операції\n\n`;
    md += `| Дата | Проект | Назва | Статус | Сума |\n|---|---|---|---|---:|\n`;
    for (const e of entries.slice(0, 20)) {
      md += `| ${e.occurredAt.toISOString().slice(0, 10)} | ${e.project?.title ?? "—"} | ${e.title} | ${e.status} | ${formatUah(Number(e.amount))} |\n`;
    }
  }
  return md;
}

// ─── Tool 2: Material spending ────────────────────────────────────────────

export const QueryMaterialSpendingInput = z.object({
  material: z
    .string()
    .min(1)
    .describe("Назва матеріалу або робіт (наприклад 'цемент', 'плитка', 'ґрунтовка')"),
  fromDate: z.string().optional().describe("Початок періоду YYYY-MM-DD"),
  toDate: z.string().optional().describe("Кінець періоду YYYY-MM-DD"),
  projectId: z.string().optional().describe("Конкретний проект (опційно)"),
});

export async function queryMaterialSpending(
  ctx: ToolContext,
  input: z.infer<typeof QueryMaterialSpendingInput>,
): Promise<string> {
  const where: Prisma.FinanceEntryWhereInput = {
    ...firmWhere(ctx.firmId),
    kind: "FACT",
    type: "EXPENSE",
    isArchived: false,
    OR: [
      { title: { contains: input.material, mode: "insensitive" } },
      { description: { contains: input.material, mode: "insensitive" } },
      { category: { contains: input.material, mode: "insensitive" } },
      { subcategory: { contains: input.material, mode: "insensitive" } },
    ],
  };
  if (input.fromDate || input.toDate) {
    where.occurredAt = {};
    if (input.fromDate) (where.occurredAt as Prisma.DateTimeFilter).gte = new Date(input.fromDate);
    if (input.toDate) (where.occurredAt as Prisma.DateTimeFilter).lte = new Date(input.toDate);
  }
  if (input.projectId) where.projectId = input.projectId;

  const entries = await prisma.financeEntry.findMany({
    where,
    select: {
      amount: true,
      occurredAt: true,
      title: true,
      project: { select: { title: true } },
      counterparty: true,
    },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

  // Aggregate by project
  const byProject = new Map<string, number>();
  for (const e of entries) {
    const key = e.project?.title ?? "Без проекту";
    byProject.set(key, (byProject.get(key) ?? 0) + Number(e.amount));
  }

  let md = `**Витрати на «${input.material}»**`;
  if (input.fromDate || input.toDate) {
    md += ` (${input.fromDate ?? "початок"} – ${input.toDate ?? "сьогодні"})`;
  }
  md += `\n\n`;
  md += `- Записів: **${entries.length}**\n`;
  md += `- Всього: **${formatUah(total)} грн**\n\n`;

  if (byProject.size > 1) {
    md += `### По проектах\n\n`;
    md += `| Проект | Сума |\n|---|---:|\n`;
    const sorted = Array.from(byProject.entries()).sort((a, b) => b[1] - a[1]);
    for (const [name, sum] of sorted) {
      md += `| ${name} | ${formatUah(sum)} |\n`;
    }
    md += `\n`;
  }

  if (entries.length > 0) {
    md += `### Деталі (топ ${Math.min(20, entries.length)})\n\n`;
    md += `| Дата | Проект | Назва | Контрагент | Сума |\n|---|---|---|---|---:|\n`;
    for (const e of entries.slice(0, 20)) {
      md += `| ${e.occurredAt.toISOString().slice(0, 10)} | ${e.project?.title ?? "—"} | ${e.title} | ${e.counterparty ?? "—"} | ${formatUah(Number(e.amount))} |\n`;
    }
  } else {
    md += `_Записів не знайдено._`;
  }
  return md;
}

// ─── Tool 3: Project summary ──────────────────────────────────────────────

export const QueryProjectSummaryInput = z.object({
  projectIdOrName: z
    .string()
    .min(1)
    .describe("ID проекту або частина назви (фуззі-пошук)"),
});

export async function queryProjectSummary(
  ctx: ToolContext,
  input: z.infer<typeof QueryProjectSummaryInput>,
): Promise<string> {
  const where: Prisma.ProjectWhereInput = {
    ...firmWhere(ctx.firmId),
    OR: [
      { id: input.projectIdOrName },
      { slug: input.projectIdOrName },
      { title: { contains: input.projectIdOrName, mode: "insensitive" } },
    ],
  };
  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      currentStage: true,
      stageProgress: true,
      totalBudget: true,
      address: true,
      firmId: true,
    },
    take: 5,
  });
  if (projects.length === 0) {
    return `Проект «${input.projectIdOrName}» не знайдено.`;
  }

  let md = "";
  for (const p of projects) {
    const aggregates = await prisma.financeEntry.groupBy({
      by: ["kind", "type", "costType"],
      where: { projectId: p.id, isArchived: false },
      _sum: { amount: true },
    });
    const totals = { planIncome: 0, planExpense: 0, factIncome: 0, factExpense: 0 };
    const byType: Record<string, { plan: number; fact: number }> = {};
    for (const a of aggregates) {
      const v = Number(a._sum.amount ?? 0);
      if (a.kind === "PLAN" && a.type === "INCOME") totals.planIncome += v;
      else if (a.kind === "PLAN" && a.type === "EXPENSE") totals.planExpense += v;
      else if (a.kind === "FACT" && a.type === "INCOME") totals.factIncome += v;
      else if (a.kind === "FACT" && a.type === "EXPENSE") totals.factExpense += v;
      if (a.type === "EXPENSE" && a.costType) {
        if (!byType[a.costType]) byType[a.costType] = { plan: 0, fact: 0 };
        if (a.kind === "PLAN") byType[a.costType].plan += v;
        else byType[a.costType].fact += v;
      }
    }
    const burn = totals.planExpense > 0 ? totals.factExpense / totals.planExpense : null;

    md += `## ${p.title}\n`;
    md += `${p.firmId === "metrum-studio" ? "Studio" : "Group"} · ${p.status} · етап: ${p.currentStage} (${p.stageProgress}%)\n`;
    if (p.address) md += `📍 ${p.address}\n`;
    md += `\n`;
    md += `| Метрика | План | Факт | Δ |\n|---|---:|---:|---:|\n`;
    md += `| Доходи | ${formatUah(totals.planIncome)} | ${formatUah(totals.factIncome)} | ${formatUah(totals.factIncome - totals.planIncome)} |\n`;
    md += `| Витрати | ${formatUah(totals.planExpense)} | ${formatUah(totals.factExpense)} | ${formatUah(totals.factExpense - totals.planExpense)} |\n`;
    md += `| **Маржа** | **${formatUah(totals.planIncome - totals.planExpense)}** | **${formatUah(totals.factIncome - totals.factExpense)}** | |\n`;
    if (burn !== null) {
      md += `\n**Burn-rate витрат: ${(burn * 100).toFixed(0)}%**${burn > 1 ? " ⚠️ перевитрата" : ""}\n`;
    }
    if (Object.keys(byType).length > 0) {
      md += `\n### Структура витрат\n| Категорія | План | Факт |\n|---|---:|---:|\n`;
      for (const [type, b] of Object.entries(byType).sort((a, b) => b[1].fact - a[1].fact)) {
        md += `| ${type} | ${formatUah(b.plan)} | ${formatUah(b.fact)} |\n`;
      }
    }
    md += `\n---\n`;
  }
  return md;
}

// ─── Tool 4: Top overspent projects ───────────────────────────────────────

export const QueryTopOverspendInput = z.object({
  limit: z.number().int().min(1).max(20).default(10),
});

export async function queryTopOverspend(
  ctx: ToolContext,
  input: z.infer<typeof QueryTopOverspendInput>,
): Promise<string> {
  const projects = await prisma.project.findMany({
    where: { ...firmWhere(ctx.firmId), status: { not: "CANCELLED" }, isTestProject: false },
    select: { id: true, title: true, firmId: true },
  });
  const ids = projects.map((p) => p.id);
  if (ids.length === 0) return "Немає активних проектів.";

  const aggregates = await prisma.financeEntry.groupBy({
    by: ["projectId", "kind", "type"],
    where: { projectId: { in: ids }, isArchived: false },
    _sum: { amount: true },
  });

  const rows: Array<{
    title: string;
    firmId: string | null;
    plan: number;
    fact: number;
    burn: number;
    over: number;
  }> = [];

  for (const p of projects) {
    let plan = 0;
    let fact = 0;
    for (const a of aggregates) {
      if (a.projectId !== p.id || a.type !== "EXPENSE") continue;
      const v = Number(a._sum.amount ?? 0);
      if (a.kind === "PLAN") plan += v;
      else if (a.kind === "FACT") fact += v;
    }
    if (plan === 0 && fact === 0) continue;
    const burn = plan > 0 ? fact / plan : 0;
    rows.push({ title: p.title, firmId: p.firmId, plan, fact, burn, over: fact - plan });
  }

  rows.sort((a, b) => b.over - a.over);
  const top = rows.slice(0, input.limit);

  let md = `**Топ ${top.length} проектів за перевитратами:**\n\n`;
  md += `| Проект | План | Факт | Перевитрата | Burn % |\n|---|---:|---:|---:|---:|\n`;
  for (const r of top) {
    const overFmt = r.over > 0 ? `+${formatUah(r.over)}` : formatUah(r.over);
    md += `| ${r.title} ${r.firmId === "metrum-studio" ? "(S)" : "(G)"} | ${formatUah(r.plan)} | ${formatUah(r.fact)} | ${overFmt} | ${(r.burn * 100).toFixed(0)}% |\n`;
  }
  return md;
}

// ─── Tool 5: Search finance entries ───────────────────────────────────────

export const SearchFinanceEntriesInput = z.object({
  search: z.string().optional().describe("Пошук по назві / описі / категорії"),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  kind: z.enum(["PLAN", "FACT"]).optional(),
  costType: z.enum(["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"]).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  projectIdOrName: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export async function searchFinanceEntries(
  ctx: ToolContext,
  input: z.infer<typeof SearchFinanceEntriesInput>,
): Promise<string> {
  const where: Prisma.FinanceEntryWhereInput = {
    ...firmWhere(ctx.firmId),
    isArchived: false,
  };
  if (input.type) where.type = input.type;
  if (input.kind) where.kind = input.kind;
  if (input.costType) where.costType = input.costType;
  if (input.search) {
    where.OR = [
      { title: { contains: input.search, mode: "insensitive" } },
      { description: { contains: input.search, mode: "insensitive" } },
      { category: { contains: input.search, mode: "insensitive" } },
      { counterparty: { contains: input.search, mode: "insensitive" } },
    ];
  }
  if (input.fromDate || input.toDate) {
    where.occurredAt = {};
    if (input.fromDate) (where.occurredAt as Prisma.DateTimeFilter).gte = new Date(input.fromDate);
    if (input.toDate) (where.occurredAt as Prisma.DateTimeFilter).lte = new Date(input.toDate);
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

  const entries = await prisma.financeEntry.findMany({
    where,
    select: {
      occurredAt: true,
      kind: true,
      type: true,
      costType: true,
      title: true,
      amount: true,
      counterparty: true,
      project: { select: { title: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: input.limit,
  });

  if (entries.length === 0) {
    return `Записів не знайдено за вказаними фільтрами.`;
  }

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);
  let md = `**Знайдено ${entries.length} записів. Сума: ${formatUah(total)} грн**\n\n`;
  md += `| Дата | План/Факт | Тип | Назва | Проект | Сума |\n|---|---|---|---|---|---:|\n`;
  for (const e of entries) {
    md += `| ${e.occurredAt.toISOString().slice(0, 10)} | ${e.kind} | ${e.type === "INCOME" ? "↗ дох" : "↘ витр"}${e.costType ? ` (${e.costType})` : ""} | ${e.title} | ${e.project?.title ?? "—"} | ${formatUah(Number(e.amount))} |\n`;
  }
  return md;
}

// ─── Tool 6: Burn-rate forecast ───────────────────────────────────────────

export const ForecastBurnRateInput = z.object({
  projectIdOrName: z.string().min(1),
  daysToForecast: z.number().int().min(7).max(365).default(30),
});

export async function forecastBurnRate(
  ctx: ToolContext,
  input: z.infer<typeof ForecastBurnRateInput>,
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
    select: { id: true, title: true, expectedEndDate: true },
  });
  if (!project) return `Проект «${input.projectIdOrName}» не знайдено.`;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recent = await prisma.financeEntry.findMany({
    where: {
      projectId: project.id,
      kind: "FACT",
      type: "EXPENSE",
      isArchived: false,
      occurredAt: { gte: thirtyDaysAgo },
    },
    select: { amount: true, occurredAt: true },
  });

  const totalsAgg = await prisma.financeEntry.groupBy({
    by: ["kind"],
    where: { projectId: project.id, type: "EXPENSE", isArchived: false },
    _sum: { amount: true },
  });
  let plan = 0;
  let fact = 0;
  for (const a of totalsAgg) {
    const v = Number(a._sum.amount ?? 0);
    if (a.kind === "PLAN") plan = v;
    else if (a.kind === "FACT") fact = v;
  }

  const recentSpend = recent.reduce((s, e) => s + Number(e.amount), 0);
  const dailyAvg = recentSpend / 30;
  const projectedSpend = dailyAvg * input.daysToForecast;
  const projectedTotal = fact + projectedSpend;
  const remainingPlan = Math.max(plan - fact, 0);
  const overrunRisk = projectedTotal > plan;
  const daysUntilOverrun = dailyAvg > 0 ? remainingPlan / dailyAvg : null;

  let md = `## Прогноз: ${project.title}\n\n`;
  md += `- Поточні витрати: **${formatUah(fact)} грн**\n`;
  md += `- Бюджет (план): **${formatUah(plan)} грн** (залишок ${formatUah(remainingPlan)})\n`;
  md += `- Середній темп (30 дн): **${formatUah(dailyAvg)} грн/день** (${recent.length} операцій)\n`;
  md += `- Прогноз через ${input.daysToForecast} днів: **${formatUah(projectedTotal)} грн**\n\n`;
  if (overrunRisk) {
    md += `⚠️ **Перевитрата на ${formatUah(projectedTotal - plan)} грн** при поточному темпі.\n`;
  } else if (daysUntilOverrun !== null && daysUntilOverrun < 365) {
    md += `🟡 До перевитрат залишилося ~**${Math.round(daysUntilOverrun)} днів** при поточному темпі.\n`;
  } else {
    md += `✓ Прогноз вкладається у бюджет.\n`;
  }
  if (project.expectedEndDate) {
    md += `\n_Очікуване закриття проекту: ${project.expectedEndDate.toISOString().slice(0, 10)}_`;
  }
  return md;
}

// ─── Tool definitions for Claude SDK ─────────────────────────────────────

export const TOOLS = [
  {
    name: "query_counterparty_balance",
    description:
      "Знайти контрагента за іменем (фуззі-пошук) і показати скільки йому винні: загальна сума, несплачені, останні операції. Використовуй коли користувач питає 'скільки винні X', 'що ми винні постачальнику Y'.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Імʼя або частина імені контрагента" },
      },
      required: ["name"],
    },
  },
  {
    name: "query_material_spending",
    description:
      "Витрати на конкретний матеріал/роботу (за назвою). Шукає по title/description/category. Можна фільтрувати по даті та проекту. Використовуй коли питають 'скільки потратили на цемент', 'витрати на плитку за червень'.",
    input_schema: {
      type: "object",
      properties: {
        material: { type: "string", description: "Назва матеріалу або робіт" },
        fromDate: { type: "string", description: "YYYY-MM-DD" },
        toDate: { type: "string", description: "YYYY-MM-DD" },
        projectId: { type: "string", description: "Конкретний проект (опційно)" },
      },
      required: ["material"],
    },
  },
  {
    name: "query_project_summary",
    description:
      "Повний фінансовий огляд проекту: PLAN/FACT по доходах і витратах, маржа, burn-rate, структура витрат по категоріях. Знаходить проект за ID або фуззі-пошуком назви.",
    input_schema: {
      type: "object",
      properties: {
        projectIdOrName: { type: "string", description: "ID або частина назви проекту" },
      },
      required: ["projectIdOrName"],
    },
  },
  {
    name: "query_top_overspend",
    description:
      "Топ проектів за перевитратами (factExpense - planExpense). Використовуй для 'покажи де у нас перевитрати', 'які проекти пілять бюджет'.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 10 },
      },
    },
  },
  {
    name: "search_finance_entries",
    description:
      "Універсальний пошук по фінансових записах. Можна комбінувати фільтри: тип (INCOME/EXPENSE), kind (PLAN/FACT), costType, дати, проект. Гнучкий — використовуй коли інші tools не підходять.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string" },
        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
        kind: { type: "string", enum: ["PLAN", "FACT"] },
        costType: {
          type: "string",
          enum: ["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"],
        },
        fromDate: { type: "string", description: "YYYY-MM-DD" },
        toDate: { type: "string", description: "YYYY-MM-DD" },
        projectIdOrName: { type: "string" },
        limit: { type: "number", default: 50 },
      },
    },
  },
  {
    name: "forecast_burn_rate",
    description:
      "Лінійний прогноз витрат проекту на N днів вперед на основі темпу останніх 30 днів. Показує чи буде перевитрата і коли. Для 'спрогнозуй чи вистачить бюджету', 'коли закінчаться кошти на проекті X'.",
    input_schema: {
      type: "object",
      properties: {
        projectIdOrName: { type: "string" },
        daysToForecast: { type: "number", default: 30 },
      },
      required: ["projectIdOrName"],
    },
  },
];

// ─── Dispatcher ───────────────────────────────────────────────────────────

export async function dispatchTool(
  ctx: ToolContext,
  name: string,
  input: unknown,
): Promise<string> {
  try {
    switch (name) {
      case "query_counterparty_balance":
        return await queryCounterpartyBalance(ctx, QueryCounterpartyBalanceInput.parse(input));
      case "query_material_spending":
        return await queryMaterialSpending(ctx, QueryMaterialSpendingInput.parse(input));
      case "query_project_summary":
        return await queryProjectSummary(ctx, QueryProjectSummaryInput.parse(input));
      case "query_top_overspend":
        return await queryTopOverspend(ctx, QueryTopOverspendInput.parse(input));
      case "search_finance_entries":
        return await searchFinanceEntries(ctx, SearchFinanceEntriesInput.parse(input));
      case "forecast_burn_rate":
        return await forecastBurnRate(ctx, ForecastBurnRateInput.parse(input));
      default:
        return `Невідомий tool: ${name}`;
    }
  } catch (e) {
    return `Помилка виконання ${name}: ${e instanceof Error ? e.message : String(e)}`;
  }
}
