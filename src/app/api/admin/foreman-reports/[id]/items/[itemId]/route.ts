import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  unauthorizedResponse,
  forbiddenResponse,
  FOREMAN_REPORT_REVIEWERS,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  getActiveRoleFromSession,
  assertCanAccessFirm,
} from "@/lib/firm/scope";

export const runtime = "nodejs";

const PatchBody = z.object({
  counterpartyId: z.string().min(1).nullable().optional(),
  supplierGuess: z.string().max(200).nullable().optional(),
  // Safe Finance Migration Phase 5.5: per-item рішення менеджера.
  costCodeId: z.string().min(1).nullable().optional(),
  financeIntent: z.enum(["COMMITTED", "ACTUAL"]).nullable().optional(),
  costType: z
    .enum(["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"])
    .optional(),
  managerNote: z.string().max(500).nullable().optional(),
  // P7: рішення ПМ по EXTRA-рядку.
  //   LINKED     → потрібен linkedEstimateItemId (cost через totalCalculated);
  //   NEW_ITEM   → ініціювати ДКО (матеріалізація у I5);
  //   INFO_ONLY  → інформаційний рядок, без cost;
  //   PENDING    → ще не вирішено (блокує approve).
  pmDecision: z.enum(["PENDING", "LINKED", "NEW_ITEM", "INFO_ONLY"]).optional(),
  linkedEstimateItemId: z.string().min(1).nullable().optional(),
});

interface Ctx {
  params: Promise<{ id: string; itemId: string }>;
}

/**
 * Менеджер на сторінці перегляду звіту може ручно привʼязати item до постачальника
 * (наприклад, AI не змаппив автоматом, або пропонує неправильну Counterparty).
 * Доступно у будь-якому статусі звіту крім APPROVED — після затвердження
 * counterpartyId копіюється у FinanceEntry і змінювати треба вже там.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  const { id, itemId } = await ctx.params;
  const item = await prisma.foremanReportItem.findFirst({
    where: { id: itemId, reportId: id },
    include: {
      report: { select: { id: true, status: true, firmId: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  assertCanAccessFirm(session, item.report.firmId);

  if (item.report.status === "APPROVED") {
    return NextResponse.json(
      { error: "Conflict", message: "Звіт затверджено — змінюй counterparty на FinanceEntry." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Якщо привʼязуємо до counterpartyId — переконатись що вона у тій самій фірмі.
  if (parsed.data.counterpartyId) {
    const cp = await prisma.counterparty.findUnique({
      where: { id: parsed.data.counterpartyId },
      select: { id: true, firmId: true, isActive: true },
    });
    if (!cp) {
      return NextResponse.json({ error: "Постачальника не знайдено" }, { status: 404 });
    }
    if (cp.firmId && item.report.firmId && cp.firmId !== item.report.firmId) {
      return forbiddenResponse();
    }
    if (!cp.isActive) {
      return NextResponse.json(
        { error: "Постачальник деактивований" },
        { status: 409 },
      );
    }
  }

  // Валідація costCodeId — має існувати і бути активним.
  if (parsed.data.costCodeId) {
    const cc = await prisma.costCode.findUnique({
      where: { id: parsed.data.costCodeId },
      select: { id: true, isActive: true },
    });
    if (!cc) {
      return NextResponse.json({ error: "Статтю витрат не знайдено" }, { status: 404 });
    }
    if (!cc.isActive) {
      return NextResponse.json(
        { error: "Стаття витрат деактивована" },
        { status: 409 },
      );
    }
  }

  // Збираємо лише ті поля, що передали (partial update).
  const data: Record<string, unknown> = {};
  if ("counterpartyId" in parsed.data) {
    data.counterpartyId = parsed.data.counterpartyId ?? null;
    // Привʼязка до counterpartyId автоматично очищає supplierGuess —
    // raw текст більше не потрібен як підказка коли уже знаємо ID.
    data.supplierGuess =
      parsed.data.counterpartyId !== undefined && parsed.data.counterpartyId !== null
        ? null
        : parsed.data.supplierGuess ?? item.supplierGuess;
  } else if ("supplierGuess" in parsed.data) {
    data.supplierGuess = parsed.data.supplierGuess ?? null;
  }
  if ("costCodeId" in parsed.data) data.costCodeId = parsed.data.costCodeId ?? null;
  if ("financeIntent" in parsed.data) data.financeIntent = parsed.data.financeIntent ?? null;
  if ("costType" in parsed.data && parsed.data.costType) data.costType = parsed.data.costType;
  if ("managerNote" in parsed.data) data.managerNote = parsed.data.managerNote ?? null;

  // P7: PM-рішення по EXTRA-рядку. LINKED вимагає валідний estimateItem у тому
  // ж проєкті; інші рішення скидають linkedEstimateItemId.
  const nextDecision =
    "pmDecision" in parsed.data ? parsed.data.pmDecision : undefined;
  const nextLinkedId =
    "linkedEstimateItemId" in parsed.data ? parsed.data.linkedEstimateItemId ?? null : undefined;
  if (nextDecision !== undefined || nextLinkedId !== undefined) {
    const effectiveDecision = nextDecision ?? item.pmDecision ?? "PENDING";
    if (effectiveDecision === "LINKED") {
      const linkId = nextLinkedId ?? item.linkedEstimateItemId;
      if (!linkId) {
        return NextResponse.json(
          { error: "Bad request", message: "Для LINKED потрібно вибрати роботу кошторису" },
          { status: 400 },
        );
      }
      const target = await prisma.estimateItem.findUnique({
        where: { id: linkId },
        select: { id: true, estimate: { select: { projectId: true } } },
      });
      // Перевірка: робота належить тому ж проєкту, що і звіт.
      const report = await prisma.foremanReport.findUnique({
        where: { id },
        select: { projectId: true },
      });
      if (!target || target.estimate?.projectId !== report?.projectId) {
        return NextResponse.json(
          { error: "Bad request", message: "Робота не належить проєкту звіту" },
          { status: 400 },
        );
      }
      data.pmDecision = "LINKED";
      data.linkedEstimateItemId = linkId;
    } else {
      if (nextDecision !== undefined) data.pmDecision = nextDecision;
      // Будь-яке рішення крім LINKED скидає привʼязку.
      data.linkedEstimateItemId = null;
    }
  }

  const updated = await prisma.foremanReportItem.update({
    where: { id: itemId },
    data,
  });

  return NextResponse.json({ data: updated });
}
