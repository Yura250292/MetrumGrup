import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Manual migration endpoint to add analysisSummary column
 * Only accessible by SUPER_ADMIN
 */
export async function POST() {
  try {
    const session = await auth();

    // Security: Only SUPER_ADMIN can run migrations
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    console.log('🔧 Running manual migration for analysisSummary...');

    // Execute migration SQL
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "analysisSummary" TEXT;
    `);

    console.log('✅ Migration completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Migration applied: analysisSummary column added to estimates table'
    });

  } catch (error) {
    console.error('❌ Migration error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Check migration status
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check if column exists
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'estimates'
        AND column_name = 'analysisSummary';
    `);

    const columnExists = result.length > 0;

    return NextResponse.json({
      columnExists,
      tableName: 'estimates',
      columnName: 'analysisSummary',
      status: columnExists ? 'Migration already applied' : 'Migration needed'
    });

  } catch (error) {
    console.error('❌ Migration check error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
