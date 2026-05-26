import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkDabiLicense } from "@/lib/integrations/dabi-license";
import {
  WRITE_ROLES,
  isAccessResponse,
  requireCounterpartyAccess,
} from "@/lib/counterparties/access";

export const runtime = "nodejs";

const CACHE_TTL_HOURS = 24;

/**
 * POST: перевіряє ліцензію контрагента через ДАБІ (HTML-scrape, не stable).
 * Оновлює `licenseValidUntil` і пише compliance-check.
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
  if (!cp.licenseNumber) {
    return NextResponse.json(
      { error: "У контрагента не вказано номер ліцензії" },
      { status: 400 },
    );
  }

  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);
  const cached = await prisma.counterpartyComplianceCheck.findFirst({
    where: {
      counterpartyId: id,
      source: "dabi",
      success: true,
      checkedAt: { gte: cutoff },
    },
    orderBy: { checkedAt: "desc" },
  });
  if (cached) {
    return NextResponse.json({
      cached: true,
      check: cached,
      licenseValidUntil: cp.licenseValidUntil,
    });
  }

  const result = await checkDabiLicense(cp.licenseNumber);

  if (!result) {
    await prisma.counterpartyComplianceCheck.create({
      data: {
        counterpartyId: id,
        source: "dabi",
        rawResponse: {},
        resultSummary: "ДАБІ недоступний або ліцензія не знайдена",
        success: false,
        errorMessage: "Failed to fetch from e-licensing.dabi.gov.ua",
      },
    });
    return NextResponse.json(
      { error: "ДАБІ тимчасово недоступний або ліцензія не знайдена" },
      { status: 503, headers: { "Retry-After": "600" } },
    );
  }

  const [, check] = await prisma.$transaction([
    prisma.counterparty.update({
      where: { id },
      data: {
        licenseValidUntil: result.validUntil ?? cp.licenseValidUntil,
      },
    }),
    prisma.counterpartyComplianceCheck.create({
      data: {
        counterpartyId: id,
        source: "dabi",
        // Зберігаємо HTML як string у JSONB-полі — обгортаємо в обʼєкт.
        rawResponse: { html: result.raw } as never,
        resultSummary: `License ${result.status}; valid until ${result.validUntil?.toISOString().slice(0, 10) ?? "n/a"}. ${result.warning}`,
        success: true,
      },
    }),
  ]);

  return NextResponse.json({
    cached: false,
    licenseStatus: result.status,
    licenseValidUntil: result.validUntil,
    scope: result.scope,
    warning: result.warning,
    check,
  });
}
