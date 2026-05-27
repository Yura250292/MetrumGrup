import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Health check endpoint for debugging production issues
 */
export async function GET() {
  try {
    const session = await auth();

    // Basic health check - no auth required
    const startTime = Date.now();

    // Test database connection
    const dbTest = await prisma.$queryRaw`SELECT 1 as test`;
    const dbLatency = Date.now() - startTime;

    // Check estimates table structure (only for SUPER_ADMIN)
    let tableInfo = null;
    if (session?.user?.role === 'SUPER_ADMIN') {
      const columns: any = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'estimates'
        ORDER BY ordinal_position;
      `);

      tableInfo = {
        totalColumns: columns.length,
        hasAnalysisSummary: columns.some((c: any) => c.column_name === 'analysisSummary'),
        columns: columns.map((c: any) => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable
        }))
      };
    }

    // Count estimates
    const estimatesCount = await prisma.estimate.count();

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        latency: `${dbLatency}ms`
      },
      estimates: {
        total: estimatesCount
      },
      tableStructure: tableInfo,
      user: session?.user ? {
        role: session.user.role,
        name: session.user.name
      } : null
    });

  } catch (error) {
    console.error('❌ Health check error:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      },
      { status: 500 }
    );
  }
}
