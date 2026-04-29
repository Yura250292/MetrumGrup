import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (!activeRole || !["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"].includes(activeRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // AI summary firm-scoped: показуємо метрики тільки активної фірми.
    const projectFirm = firmId ? { firmId } : {};
    const taskFirm = firmId ? { project: { firmId } } : {};
    const paymentFirm = firmId ? { project: { firmId } } : {};
    const financeFirm = firmId ? { firmId } : {};

    const [
      activeProjects,
      overdueTasksCount,
      completedWeekCount,
      overduePayments,
      monthIncome,
      monthExpense,
      upcomingDeadlines,
    ] = await Promise.all([
      prisma.project.count({ where: { status: "ACTIVE", ...projectFirm } }),
      prisma.task.count({
        where: { isArchived: false, status: { isDone: false }, dueDate: { lt: now }, ...taskFirm },
      }),
      prisma.task.count({
        where: { status: { isDone: true }, completedAt: { gte: startOfWeek }, ...taskFirm },
      }),
      prisma.payment.findMany({
        where: { status: { in: ["PENDING", "PARTIAL"] }, scheduledDate: { lt: now }, ...paymentFirm },
        select: { amount: true, project: { select: { title: true } } },
      }),
      prisma.financeEntry.aggregate({
        where: { type: "INCOME", isArchived: false, occurredAt: { gte: startOfMonth, lte: endOfMonth }, ...financeFirm },
        _sum: { amount: true },
      }),
      prisma.financeEntry.aggregate({
        where: { type: "EXPENSE", isArchived: false, occurredAt: { gte: startOfMonth, lte: endOfMonth }, ...financeFirm },
        _sum: { amount: true },
      }),
      prisma.project.findMany({
        where: {
          status: "ACTIVE",
          expectedEndDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 3600 * 1000) },
          ...projectFirm,
        },
        select: { title: true, expectedEndDate: true },
        take: 3,
      }),
    ]);

    const income = Number(monthIncome._sum.amount || 0);
    const expense = Number(monthExpense._sum.amount || 0);
    const net = income - expense;
    const overdueSum = overduePayments.reduce((s, p) => s + Number(p.amount), 0);
    const overdueProjects = [...new Set(overduePayments.map((p) => p.project.title))];

    const dataContext = [
      `Активних проєктів: ${activeProjects}`,
      `Завершено задач за тиждень: ${completedWeekCount}`,
      `Прострочених задач: ${overdueTasksCount}`,
      overduePayments.length > 0
        ? `Прострочених платежів: ${overduePayments.length} на суму ${Math.round(overdueSum).toLocaleString("uk-UA")} ₴ (проєкти: ${overdueProjects.join(", ")})`
        : "Прострочених платежів немає",
      `Дохід за місяць: ${Math.round(income).toLocaleString("uk-UA")} ₴`,
      `Витрати за місяць: ${Math.round(expense).toLocaleString("uk-UA")} ₴`,
      `Чистий прибуток: ${Math.round(net).toLocaleString("uk-UA")} ₴`,
      upcomingDeadlines.length > 0
        ? `Найближчі дедлайни: ${upcomingDeadlines.map((d) => `${d.title} (${d.expectedEndDate?.toLocaleDateString("uk-UA")})`).join(", ")}`
        : "Найближчих дедлайнів немає",
    ].join("\n");

    const userName = session.user.name?.split(" ")[0] || "Керівник";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `Ти — AI-асистент будівельної компанії. Створи короткий підсумок дня для ${userName} (роль: ${activeRole}) українською мовою. 2-3 речення. Будь конкретним, вказуй числа. Тон — діловий, але дружній. Не використовуй емодзі.`,
        },
        {
          role: "user",
          content: `Ось поточні показники:\n${dataContext}\n\nСтвори короткий підсумок дня.`,
        },
      ],
    });

    const summary = completion.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("AI Summary error:", error);
    return NextResponse.json(
      { summary: "Не вдалося згенерувати підсумок. Спробуйте пізніше." },
      { status: 200 },
    );
  }
}
