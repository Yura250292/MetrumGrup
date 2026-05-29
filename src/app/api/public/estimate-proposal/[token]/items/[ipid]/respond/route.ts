import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isValidProposalTokenShape } from "@/lib/estimates/proposal-tokens";
import {
  applyItemAction,
  ProposalClosedError,
  StaleRoundError,
} from "@/lib/estimates/proposals";
import { InvalidTransitionError } from "@/lib/estimates/proposal-state-machine";
import {
  notifyClientAction,
  notifyFullyApproved,
  notifyRejected,
} from "@/lib/notifications/estimate-proposal-events";

const ALLOWED_CLIENT_ACTIONS = new Set(["APPROVE", "REJECT", "COUNTER"]);

/**
 * POST — клієнтська дія по конкретному рядку (через token).
 *
 * Body: { action, expectedRound, proposedQuantity?, proposedUnitPrice?, comment? }
 *
 * Захист:
 *   - isValidTokenShape перед БД
 *   - token має бути активного proposal (не WITHDRAWN/EXPIRED/closed)
 *   - itemProposal має належати тому ж proposal'у (anti-IDOR)
 *   - allowed actions whitelist
 *   - optimistic concurrency через expectedRound → 409
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; ipid: string }> },
) {
  const { token, ipid } = await params;

  if (!isValidProposalTokenShape(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    expectedRound?: number;
    proposedQuantity?: string | number;
    proposedUnitPrice?: string | number;
    comment?: string;
  };

  const { action, expectedRound, proposedQuantity, proposedUnitPrice, comment } =
    body;

  if (!action || !ALLOWED_CLIENT_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (typeof expectedRound !== "number" || expectedRound < 0) {
    return NextResponse.json(
      { error: "expectedRound is required (number)" },
      { status: 400 },
    );
  }
  if (action === "COUNTER") {
    if (proposedQuantity == null || proposedUnitPrice == null) {
      return NextResponse.json(
        { error: "COUNTER requires proposedQuantity AND proposedUnitPrice" },
        { status: 400 },
      );
    }
  }

  // Verify token → proposal binding AND item belongs to that proposal.
  const itemProposal = await prisma.estimateItemProposal.findUnique({
    where: { id: ipid },
    select: {
      id: true,
      proposalId: true,
      estimateItem: { select: { description: true } },
      proposal: {
        select: { accessToken: true, status: true, expiresAt: true },
      },
    },
  });
  if (!itemProposal || itemProposal.proposal.accessToken !== token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    itemProposal.proposal.status === "DRAFT" ||
    itemProposal.proposal.status === "WITHDRAWN" ||
    itemProposal.proposal.status === "EXPIRED"
  ) {
    return NextResponse.json(
      { error: "Proposal closed", status: itemProposal.proposal.status },
      { status: 410 },
    );
  }
  if (
    itemProposal.proposal.expiresAt &&
    itemProposal.proposal.expiresAt < new Date()
  ) {
    return NextResponse.json(
      { error: "Proposal expired", status: "EXPIRED" },
      { status: 410 },
    );
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  try {
    const result = await applyItemAction({
      itemProposalId: ipid,
      side: "client",
      action: action as "APPROVE" | "REJECT" | "COUNTER",
      expectedRound,
      proposedQuantity: proposedQuantity ?? null,
      proposedUnitPrice: proposedUnitPrice ?? null,
      comment: comment ?? null,
      actorUserId: null,
      ipAddress,
      userAgent,
    });

    // Fire-and-forget нотифікації внутрішнім адресатам.
    void notifyClientAction({
      proposalId: itemProposal.proposalId,
      itemDescription: itemProposal.estimateItem.description,
      action,
    });
    if (result.proposalStatus === "FULLY_APPROVED") {
      void notifyFullyApproved({ proposalId: itemProposal.proposalId });
    } else if (result.proposalStatus === "REJECTED") {
      void notifyRejected({ proposalId: itemProposal.proposalId });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof StaleRoundError) {
      return NextResponse.json(
        { error: err.message, expected: err.expected, actual: err.actual },
        { status: 409 },
      );
    }
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json(
        { error: err.message, from: err.from },
        { status: 409 },
      );
    }
    if (err instanceof ProposalClosedError) {
      return NextResponse.json(
        { error: err.message, status: err.status },
        { status: 410 },
      );
    }
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
