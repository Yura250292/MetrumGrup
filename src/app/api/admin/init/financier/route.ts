import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/init/financier
 *
 * Ініціалізація фінансиста в продакшн:
 * - Створює/оновлює користувача з роллю FINANCIER
 * - Встановлює статус кошторисів в FINANCE_REVIEW
 *
 * Доступ: тільки SUPER_ADMIN
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Only SUPER_ADMIN can initialize
  if (session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    const body = await request.json();
    const { email, name, password, createEstimates = false } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email обов'язковий" },
        { status: 400 }
      );
    }

    const results: any = {
      user: null,
      estimates: [],
      message: "",
    };

    // 1. Створити або оновити користувача
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Оновити роль якщо користувач існує
      const updated = await prisma.user.update({
        where: { email },
        data: { role: "FINANCIER" },
        select: { id: true, email: true, name: true, role: true },
      });

      results.user = updated;
      results.message = `Роль користувача ${email} оновлено на FINANCIER`;
    } else {
      // Створити нового користувача
      if (!name || !password) {
        return NextResponse.json(
          { error: "Для створення нового користувача потрібні name та password" },
          { status: 400 }
        );
      }

      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash(password, 10);

      const created = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: "FINANCIER",
          isActive: true,
        },
        select: { id: true, email: true, name: true, role: true },
      });

      results.user = created;
      results.message = `Створено нового користувача ${email} з роллю FINANCIER`;
    }

    // 2. Якщо потрібно, створити тестові кошториси в статусі FINANCE_REVIEW
    if (createEstimates) {
      // Отримати останні 3 кошториси в статусі DRAFT або ENGINEER_REVIEW
      const estimates = await prisma.estimate.findMany({
        where: {
          status: { in: ["DRAFT", "ENGINEER_REVIEW"] },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      });

      // Оновити їх статус
      if (estimates.length > 0) {
        const updatePromises = estimates.map((est) =>
          prisma.estimate.update({
            where: { id: est.id },
            data: { status: "FINANCE_REVIEW" },
            select: { id: true, number: true, title: true, status: true },
          })
        );

        results.estimates = await Promise.all(updatePromises);
        results.message += `. Оновлено ${estimates.length} кошторис(ів) в статус FINANCE_REVIEW`;
      } else {
        results.message += `. Немає кошторисів для оновлення статусу`;
      }
    }

    // 3. Логування
    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entity: "FinancierInit",
        entityId: results.user.id,
        userId: session.user.id,
        newData: {
          email,
          role: "FINANCIER",
          estimatesUpdated: results.estimates.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: results,
      instructions: {
        step1: `Користувач створено: ${results.user.email}`,
        step2: results.estimates.length > 0
          ? `Кошториси оновлено: ${results.estimates.map((e: any) => e.number).join(", ")}`
          : "Немає кошторисів для оновлення",
        step3: "Тепер увійдіть під цим користувачем та відкрийте /admin/finance",
        loginUrl: "/login",
        financeUrl: "/admin/finance",
      },
    });
  } catch (error: any) {
    console.error("Error initializing financier:", error);
    return NextResponse.json(
      { error: error.message || "Помилка ініціалізації" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/init/financier
 *
 * Перевірка стану фінансового функціоналу
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (session.user.role !== "SUPER_ADMIN") {
    return forbiddenResponse();
  }

  try {
    // Підрахувати фінансистів
    const financiers = await prisma.user.findMany({
      where: { role: "FINANCIER" },
      select: { id: true, email: true, name: true, isActive: true },
    });

    // Підрахувати кошториси в різних статусах
    const estimateStats = await prisma.estimate.groupBy({
      by: ["status"],
      _count: true,
    });

    // Підрахувати шаблони
    const templatesCount = await prisma.financialTemplate.count();

    return NextResponse.json({
      financiers: {
        count: financiers.length,
        users: financiers,
      },
      estimates: estimateStats.map((stat) => ({
        status: stat.status,
        count: stat._count,
      })),
      templates: {
        count: templatesCount,
      },
      ready: financiers.length > 0,
      message: financiers.length > 0
        ? "Фінансовий функціонал готовий до використання"
        : "Немає користувачів з роллю FINANCIER",
    });
  } catch (error: any) {
    console.error("Error checking financier status:", error);
    return NextResponse.json(
      { error: error.message || "Помилка перевірки" },
      { status: 500 }
    );
  }
}
