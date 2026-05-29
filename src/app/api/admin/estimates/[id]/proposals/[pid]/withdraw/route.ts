import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  ProposalClosedError,
  withdrawProposal,
} from "@/lib/estimates/proposals";

const ADMIN_ROLES = ["SUPER_ADMIN", "MANAGER"] as const;

/** POST — відкликати proposal. Token стає invalid (через перевірку status). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> },
) {
  const { pid: proposalId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ADMIN_ROLES.includes(session.user.role as (typeof ADMIN_ROLES)[number])) {
    return forbiddenResponse();
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : undefined;

  const proposal = await prisma.estimateProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, firmId: true },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role !== "SUPER_ADMIN" && session.user.firmId !== proposal.firmId) {
    return forbiddenResponse();
  }

  try {
    const updated = await withdrawProposal({
      proposalId,
      actorUserId: session.user.id,
      reason,
    });
    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof ProposalClosedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Failed to withdraw";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
