import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getVersionHistory } from '@/lib/versioning';
import { getApprovalChain } from '@/lib/approval-tracking';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/estimates/[id]/history
 *
 * Отримати повну історію змін кошториса:
 * - Версії (versions)
 * - Апрували з підписами (approvals)
 * - Критичні зміни (criticalChanges)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { id } = await params;

    // Перевірити доступ до кошториса
    const estimate = await prisma.estimate.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: 'Estimate not found' },
        { status: 404 }
      );
    }

    // Паралельно отримати всі дані історії
    const [versions, approvals, criticalChanges] = await Promise.all([
      getVersionHistory(id),
      getApprovalChain(id),
      prisma.estimateCriticalChange.findMany({
        where: { estimateId: id },
        include: {
          user: {
            select: {
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Обмежити до 100 останніх змін
      }),
    ]);

    return NextResponse.json({
      versions,
      approvals,
      criticalChanges,
      estimateId: id,
    });
  } catch (error: any) {
    console.error('Error fetching estimate history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
