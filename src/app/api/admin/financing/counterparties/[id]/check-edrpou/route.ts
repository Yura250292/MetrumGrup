import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupEdrpou } from "@/lib/integrations/clarity-project";
import {
  WRITE_ROLES,
  isAccessResponse,
  requireCounterpartyAccess,
} from "@/lib/counterparties/access";

export const runtime = "nodejs";

const CACHE_TTL_HOURS = 24;

/**
 * POST: викликає clarity-project lookup для контрагента. Якщо успішний,
 * оновлює `taxStatus`, `taxStatusCheckedAt`, `legalForm` (якщо пусто) і
 * пише `CounterpartyComplianceCheck`.
 *
 * Кешування 24h: якщо є success-запис за останні 24 години, повертаємо його
 * без зовнішнього виклику.
 *
 * Failover: якщо інтеграція повернула null → 503 retry-after.
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: WRITE_ROLES,
  });
  if (isAccessResponse(access)) return access;

  const cp = access.counterparty;
  if (!cp.edrpou) {
    return NextResponse.json(
      { error: "У контрагента не вказано ЄДРПОУ" },
      { status: 400 },
    );
  }

  // 24h cache.
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);
  const cached = await prisma.counterpartyComplianceCheck.findFirst({
    where: {
      counterpartyId: id,
      source: { in: ["clarity-project", "opendatabot"] },
      success: true,
      checkedAt: { gte: cutoff },
    },
    orderBy: { checkedAt: "desc" },
  });
  if (cached) {
    return NextResponse.json({
      cached: true,
      check: cached,
      taxStatus: cp.taxStatus,
    });
  }

  const result = await lookupEdrpou(cp.edrpou);

  if (!result) {
    // Пишемо failure-запис для аудиту.
    await prisma.counterpartyComplianceCheck.create({
      data: {
        counterpartyId: id,
        source: "clarity-project",
        rawResponse: {},
        resultSummary: "Зовнішнє джерело недоступне",
        success: false,
        errorMessage: "Failed to fetch from clarity-project/opendatabot",
      },
    });
    return NextResponse.json(
      { error: "Сервіс відкритих даних тимчасово недоступний" },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  // Update counterparty + write success check у транзакції.
  const [, check] = await prisma.$transaction([
    prisma.counterparty.update({
      where: { id },
      data: {
        taxStatus: result.taxStatus,
        taxStatusCheckedAt: new Date(),
        legalForm: cp.legalForm ?? result.legalForm,
      },
    }),
    prisma.counterpartyComplianceCheck.create({
      data: {
        counterpartyId: id,
        source: result.source,
        rawResponse: result.raw as never,
        resultSummary:
          result.taxStatus !== cp.taxStatus
            ? `Status: ${cp.taxStatus} → ${result.taxStatus}`
            : `Status unchanged (${result.taxStatus})`,
        success: true,
      },
    }),
  ]);

  return NextResponse.json({
    cached: false,
    taxStatus: result.taxStatus,
    legalForm: result.legalForm,
    check,
  });
}
