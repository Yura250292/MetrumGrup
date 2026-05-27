import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-utils';

/**
 * Health check endpoint for debugging production issues.
 * SUPER_ADMIN only: leaks DB schema + entity counts.
 */
export async function GET() {
  try {
    await requireSuperAdmin();
    const session = await auth();

    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1 as test`;
    const dbLatency = Date.now() - startTime;

    const columns = await prisma.$queryRawUnsafe<
      Array<{ column_name: string; data_type: string; is_nullable: string }>
    >(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'estimates'
      ORDER BY ordinal_position;
    `);

    const tableInfo = {
      totalColumns: columns.length,
      hasAnalysisSummary: columns.some((c) => c.column_name === 'analysisSummary'),
      columns: columns.map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable,
      })),
    };

    const estimatesCount = await prisma.estimate.count();

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: { connected: true, latency: `${dbLatency}ms` },
      estimates: { total: estimatesCount },
      tableStructure: tableInfo,
      user: session?.user ? { role: session.user.role, name: session.user.name } : null,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') return unauthorizedResponse();
      if (error.message === 'Forbidden') return forbiddenResponse();
    }
    console.error('❌ Health check error:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
