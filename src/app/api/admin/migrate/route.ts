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

    console.log('🔧 Running manual migrations...');

    // Migration 1: analysisSummary column
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "analysisSummary" TEXT;
    `);
    console.log('✅ Migration 1: analysisSummary column added');

    // Migration 2: Enable pgvector extension
    await prisma.$executeRawUnsafe(`
      CREATE EXTENSION IF NOT EXISTS vector;
    `);
    console.log('✅ Migration 2: pgvector extension enabled');

    // Migration 3: RAG tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS project_vectors (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        project_id TEXT NOT NULL,
        file_name TEXT,
        file_type TEXT,
        chunk_index INTEGER,
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS project_vectors_embedding_idx
        ON project_vectors
        USING hnsw (embedding vector_cosine_ops);

      CREATE INDEX IF NOT EXISTS project_vectors_project_id_idx
        ON project_vectors(project_id);

      CREATE TABLE IF NOT EXISTS project_parsed_content (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        project_id TEXT NOT NULL UNIQUE,
        extracted_data JSONB DEFAULT '{}'::jsonb,
        full_text TEXT,
        processing_status TEXT DEFAULT 'pending',
        error_message TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS price_cache (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        material_name TEXT NOT NULL,
        unit TEXT NOT NULL,
        average_price DECIMAL NOT NULL,
        sources JSONB DEFAULT '[]'::jsonb,
        confidence DECIMAL NOT NULL,
        embedding vector(1536),
        cached_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
        UNIQUE(material_name, unit)
      );

      CREATE INDEX IF NOT EXISTS price_cache_embedding_idx
        ON price_cache
        USING hnsw (embedding vector_cosine_ops);
    `);
    console.log('✅ Migration 3: RAG tables created');

    console.log('✅ All migrations completed successfully');

    return NextResponse.json({
      success: true,
      message: 'All migrations applied successfully',
      migrations: [
        'analysisSummary column',
        'pgvector extension',
        'RAG tables (project_vectors, project_parsed_content, price_cache)'
      ]
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

    // Check if migrations are applied
    const columnCheck: any = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'estimates'
        AND column_name = 'analysisSummary';
    `);

    const tablesCheck: any = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('project_vectors', 'project_parsed_content', 'price_cache');
    `);

    const extensionCheck: any = await prisma.$queryRawUnsafe(`
      SELECT extname
      FROM pg_extension
      WHERE extname = 'vector';
    `);

    const analysisSummaryExists = columnCheck.length > 0;
    const ragTablesExist = tablesCheck.length === 3;
    const pgvectorExists = extensionCheck.length > 0;
    const allMigrationsApplied = analysisSummaryExists && ragTablesExist && pgvectorExists;

    return NextResponse.json({
      allMigrationsApplied,
      details: {
        analysisSummary: analysisSummaryExists,
        ragTables: ragTablesExist,
        pgvectorExtension: pgvectorExists
      },
      status: allMigrationsApplied ? 'All migrations applied' : 'Migrations needed',
      foundTables: tablesCheck.map((t: any) => t.table_name)
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
