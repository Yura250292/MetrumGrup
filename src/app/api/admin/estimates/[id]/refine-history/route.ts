/**
 * GET /api/admin/estimates/[id]/refine-history
 *
 * Returns the audit trail of refine runs for a given estimate (Plan 6.2).
 * Each row captures who refined it, why, what changed, and by how much.
 *
 * Use cases:
 *   • Engineer/financier review queue: "what did the AI change since I
 *     last looked at this estimate?".
 *   • Diff modal: side-by-side compare of two consecutive versions.
 *   • Compliance: prove that a refine was triggered by user X with
 *     reason Y on date Z.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/auth-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const allowedRoles = ['SUPER_ADMIN', 'MANAGER', 'ENGINEER', 'FINANCIER'];
  if (!allowedRoles.includes(session.user.role)) return forbiddenResponse();

  const { id } = await params;

  try {
    // Find rows where this estimate is either the result of a refine OR the
    // source of one. The UI typically wants both directions to draw a chain.
    const history = await prisma.estimateRefineHistory.findMany({
      where: {
        OR: [{ estimateId: id }, { previousEstimateId: id }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        refinedBy: { select: { id: true, name: true, email: true } },
        estimate: { select: { id: true, number: true, totalAmount: true } },
        previousEstimate: { select: { id: true, number: true, totalAmount: true } },
      },
      take: 50,
    });

    return NextResponse.json({ data: history });
  } catch (error) {
    console.error('Error fetching refine history:', error);
    return NextResponse.json(
      { error: 'Помилка завантаження історії рефайну' },
      { status: 500 }
    );
  }
}
