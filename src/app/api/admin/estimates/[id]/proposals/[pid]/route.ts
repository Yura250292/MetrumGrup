import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"] as const;

/**
 * GET — повний стан proposal: items + поточний раунд + останні дії.
 * Не повертає round-історію (для item-history є окремий endpoint), бо це
 * дешевша часта відповідь у Negotiation-табі.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> },
) {
  const { id: estimateId, pid: proposalId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ADMIN_ROLES.includes(session.user.role as (typeof ADMIN_ROLES)[number])) {
    return forbiddenResponse();
  }

  const proposal = await prisma.estimateProposal.findFirst({
    where: { id: proposalId, estimateId },
    select: {
      id: true,
      estimateId: true,
      firmId: true,
      status: true,
      emailSnapshot: true,
      sentAt: true,
      firstViewedAt: true,
      lastViewedAt: true,
      expiresAt: true,
      completedAt: true,
      itemsTotal: true,
      itemsApproved: true,
      itemsRejected: true,
      itemsPending: true,
      createdAt: true,
      counterparty: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      baselineVersion: { select: { id: true, versionNumber: true, snapshotHash: true } },
      itemStates: {
        select: {
          id: true,
          estimateItemId: true,
          state: true,
          currentQuantity: true,
          currentUnitPrice: true,
          currentAmount: true,
          currentRound: true,
          lastActorSide: true,
          lastActionAt: true,
          estimateItem: {
            select: {
              id: true,
              description: true,
              unit: true,
              quantity: true,
              unitPrice: true,
              amount: true,
              sortOrder: true,
              section: { select: { id: true, title: true, sortOrder: true } },
            },
          },
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          eventType: true,
          actorSide: true,
          actorUserId: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Firm-isolation.
  if (session.user.role !== "SUPER_ADMIN" && session.user.firmId !== proposal.firmId) {
    return forbiddenResponse();
  }

  return NextResponse.json({ data: proposal });
}
