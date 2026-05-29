import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { finalizeProposal } from "@/lib/estimates/proposals";

const ADMIN_ROLES = ["SUPER_ADMIN", "MANAGER"] as const;

/**
 * POST — фірма фіналізує proposal: пише EstimateApprovalStep (stepType=
 * CLIENT_APPROVAL), переводить Estimate.status у APPROVED або REVISION
 * (для PARTIALLY_APPROVED — потім треба згенерувати нову revised версію).
 */
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

  const proposal = await prisma.estimateProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, firmId: true },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role !== "SUPER_ADMIN" && session.user.firmId !== proposal.firmId) {
    return forbiddenResponse();
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  try {
    const updated = await finalizeProposal({
      proposalId,
      actorUserId: session.user.id,
      ipAddress,
      userAgent,
    });
    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to finalize";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
