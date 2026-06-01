import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  unauthorizedResponse,
  forbiddenResponse,
  FOREMAN_REPORT_REVIEWERS,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession, assertCanAccessFirm } from "@/lib/firm/scope";
import { peekNextCONumber, withRetryOnUniqueViolation } from "@/lib/change-orders/numbering";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string; itemId: string }>;
}

/**
 * POST /api/admin/foreman-reports/[id]/items/[itemId]/to-change-order (P7/P10).
 *
 * PM перетворює EXTRA-рядок звіту у DRAFT ДКО зі scope-рядком action=ADD,
 * засіяним з даних extra. Рядок звіту отримує pmDecision=NEW_ITEM. Після
 * погодження ДКО робота матеріалізується у кошторис (cascade) і стає reportable.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  const { id, itemId } = await ctx.params;
  const item = await prisma.foremanReportItem.findFirst({
    where: { id: itemId, reportId: id },
    include: {
      report: {
        select: { id: true, status: true, firmId: true, projectId: true },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  assertCanAccessFirm(session, item.report.firmId);

  if (item.itemType !== "EXTRA") {
    return NextResponse.json(
      { error: "Bad request", message: "ДКО створюється лише з додаткової роботи (EXTRA)" },
      { status: 400 },
    );
  }
  if (item.report.status === "APPROVED") {
    return NextResponse.json(
      { error: "Conflict", message: "Звіт затверджено." },
      { status: 409 },
    );
  }

  const firmId = item.report.firmId;
  if (!firmId) {
    return NextResponse.json(
      { error: "Bad request", message: "Звіт без фірми — не можна створити ДКО" },
      { status: 400 },
    );
  }
  const title = item.nameOverride ?? item.title;
  const unit = item.unitOverride ?? item.unit ?? "шт";
  const qty = item.quantity != null ? Number(item.quantity) : 1;
  const unitPrice = item.unitPrice != null ? Number(item.unitPrice) : 0;

  const co = await withRetryOnUniqueViolation(() =>
    prisma.$transaction(async (tx) => {
      const number = await peekNextCONumber(tx, firmId);
      const created = await tx.changeOrder.create({
        data: {
          firmId,
          projectId: item.report.projectId,
          number,
          type: "ADD",
          title: `Дод. робота: ${title}`,
          description: `Створено зі звіту виконроба (extra «${title}»).`,
          costImpact: qty * unitPrice,
          status: "DRAFT",
          requestedById: session.user.id,
          items: {
            create: [
              {
                description: title,
                unit,
                qty,
                unitPrice,
                totalPrice: qty * unitPrice,
                sign: 1,
                sortOrder: 0,
                action: "ADD",
                newQuantity: qty,
                unitCost: unitPrice,
              },
            ],
          },
        },
        select: { id: true, number: true },
      });

      // Помічаємо рядок звіту як NEW_ITEM (рішення прийнято).
      await tx.foremanReportItem.update({
        where: { id: itemId },
        data: { pmDecision: "NEW_ITEM" },
      });

      return created;
    }),
  );

  return NextResponse.json({ data: co }, { status: 201 });
}
