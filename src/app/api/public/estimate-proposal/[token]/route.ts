import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isValidProposalTokenShape } from "@/lib/estimates/proposal-tokens";
import { markProposalViewed } from "@/lib/estimates/proposals";
import { notifyProposalViewed } from "@/lib/notifications/estimate-proposal-events";

/**
 * GET — публічна сторінка proposal по token. Анти-енумераційний фільтр
 * (isValidTokenShape) ДО запиту в БД щоб не палити СУБД ботам.
 *
 * Whitelist полів: клієнт бачить description/unit/quantity/unitPrice/amount,
 * але НЕ laborRate/laborHours/costType/priceSource/confidence/internal notes/
 * margins/AI provenance. Захист: explicit select на estimateItem.
 *
 * Stamp firstViewedAt + lastViewedAt — у тій самій транзакції (markProposalViewed).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!isValidProposalTokenShape(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const proposal = await prisma.estimateProposal.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      status: true,
      firmId: true,
      expiresAt: true,
      sentAt: true,
      firstViewedAt: true,
      lastViewedAt: true,
      itemsTotal: true,
      itemsApproved: true,
      itemsRejected: true,
      itemsPending: true,
      counterparty: { select: { name: true } },
      estimate: {
        select: {
          id: true,
          number: true,
          title: true,
          finalAmount: true,
          finalClientPrice: true,
          // Project info для брендингу/контексту (без чутливого).
          project: {
            select: {
              id: true,
              title: true,
              address: true,
              firmId: true,
            },
          },
        },
      },
      itemStates: {
        select: {
          id: true,
          state: true,
          currentQuantity: true,
          currentUnitPrice: true,
          currentAmount: true,
          currentRound: true,
          lastActorSide: true,
          lastActionAt: true,
          estimateItem: {
            select: {
              // СУВОРИЙ whitelist — лише видимі клієнту поля.
              id: true,
              description: true,
              unit: true,
              sortOrder: true,
              section: {
                select: { id: true, title: true, sortOrder: true },
              },
            },
          },
        },
      },
    },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Terminal/closed proposals — token de-facto invalid.
  if (
    proposal.status === "DRAFT" ||
    proposal.status === "WITHDRAWN" ||
    proposal.status === "EXPIRED"
  ) {
    return NextResponse.json(
      { error: "Proposal closed", status: proposal.status },
      { status: 410 },
    );
  }

  // Перевірка expiry на read-time (cron може ще не відпрацював).
  if (proposal.expiresAt && proposal.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Proposal expired", status: "EXPIRED" },
      { status: 410 },
    );
  }

  // Stamp view (best-effort; помилка не валить read). Нотифікація PM/автору
  // спрацьовує лише при першому view — guard всередині markProposalViewed.
  try {
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const wasFirstView = proposal.firstViewedAt === null;
    await markProposalViewed({ proposalId: proposal.id, ipAddress });
    if (wasFirstView) {
      void notifyProposalViewed({ proposalId: proposal.id });
    }
  } catch {
    // ignore — view-stamp non-critical
  }

  return NextResponse.json({ data: proposal });
}
