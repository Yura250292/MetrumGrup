import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  applyItemAction,
  ProposalClosedError,
  StaleRoundError,
} from "@/lib/estimates/proposals";
import { InvalidTransitionError } from "@/lib/estimates/proposal-state-machine";

const ADMIN_ROLES = ["SUPER_ADMIN", "MANAGER"] as const;
const ALLOWED_FIRM_ACTIONS = new Set([
  "ACCEPT_COUNTER",
  "REJECT_COUNTER",
  "COUNTER",
]);

/**
 * POST — фірма відповідає на client COUNTER. Дозволені дії: ACCEPT_COUNTER,
 * REJECT_COUNTER, COUNTER. Будь-яка інша → 400.
 */
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; pid: string; ipid: string }> },
) {
  const { pid: proposalId, ipid } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ADMIN_ROLES.includes(session.user.role as (typeof ADMIN_ROLES)[number])) {
    return forbiddenResponse();
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

  if (!action || !ALLOWED_FIRM_ACTIONS.has(action)) {
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

  // Firm isolation + binding check.
  const itemProposal = await prisma.estimateItemProposal.findUnique({
    where: { id: ipid },
    select: {
      id: true,
      proposalId: true,
      proposal: { select: { id: true, firmId: true } },
    },
  });
  if (
    !itemProposal ||
    itemProposal.proposalId !== proposalId ||
    !itemProposal.proposal
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.firmId !== itemProposal.proposal.firmId
  ) {
    return forbiddenResponse();
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  try {
    const result = await applyItemAction({
      itemProposalId: ipid,
      side: "firm",
      action: action as "ACCEPT_COUNTER" | "REJECT_COUNTER" | "COUNTER",
      expectedRound,
      proposedQuantity: proposedQuantity ?? null,
      proposedUnitPrice: proposedUnitPrice ?? null,
      comment: comment ?? null,
      actorUserId: session.user.id,
      ipAddress,
      userAgent,
    });

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
