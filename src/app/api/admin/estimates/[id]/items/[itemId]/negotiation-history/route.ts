import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"] as const;

/**
 * GET — cross-proposal історія раундів по одному рядку кошториса.
 *
 * Якщо рядок входить у кілька proposal'ів (зокрема після withdraw+re-send),
 * повертаємо плоский список раундів усіх proposal'ів, відсортований за часом.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: estimateId, itemId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ADMIN_ROLES.includes(session.user.role as (typeof ADMIN_ROLES)[number])) {
    return forbiddenResponse();
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { project: { select: { firmId: true } } },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.firmId !== estimate.project.firmId
  ) {
    return forbiddenResponse();
  }

  const rounds = await prisma.estimateItemNegotiationRound.findMany({
    where: {
      itemProposal: {
        estimateItemId: itemId,
        proposal: { estimateId },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      roundNumber: true,
      actorSide: true,
      actorUserId: true,
      action: true,
      proposedQuantity: true,
      proposedUnitPrice: true,
      proposedAmount: true,
      comment: true,
      ipAddress: true,
      createdAt: true,
      actor: { select: { id: true, name: true, email: true } },
      itemProposal: {
        select: {
          id: true,
          proposalId: true,
          proposal: { select: { status: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: rounds });
}
