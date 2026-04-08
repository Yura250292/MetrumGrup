/**
 * Діагностика векторизації проекту
 * GET /api/admin/projects/{id}/vectorize-status
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    // Статистика по файлах
    const fileStats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        file_name,
        file_type,
        COUNT(*) as chunks_count,
        AVG(LENGTH(content)) as avg_chunk_length,
        SUM(LENGTH(content)) as total_content_length
      FROM project_vectors
      WHERE project_id = $1
      GROUP BY file_name, file_type
      ORDER BY file_name
    `, projectId);

    // Загальна статистика
    const totalStats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) as total_chunks,
        COUNT(DISTINCT file_name) as total_files,
        SUM(LENGTH(content)) as total_content
      FROM project_vectors
      WHERE project_id = $1
    `, projectId);

    // Витягнуті дані
    const extractedData = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        extracted_data,
        processing_status,
        processed_at
      FROM project_parsed_content
      WHERE project_id = $1
    `, projectId);

    // Приклади контенту для кожного файлу
    const contentSamples = await prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT ON (file_name)
        file_name,
        LEFT(content, 200) as content_preview
      FROM project_vectors
      WHERE project_id = $1
      ORDER BY file_name, chunk_index
    `, projectId);

    return NextResponse.json({
      projectId,
      totalStats: totalStats[0],
      fileStats,
      extractedData: extractedData[0],
      contentSamples,
      analyzed: fileStats.map(f => ({
        file: f.file_name,
        type: f.file_type,
        chunks: parseInt(f.chunks_count),
        totalChars: parseInt(f.total_content_length),
        avgChunkSize: parseInt(f.avg_chunk_length),
        hasContent: parseInt(f.total_content_length) > 0
      }))
    });

  } catch (error) {
    console.error('Помилка перевірки векторизації:', error);
    return NextResponse.json(
      { error: 'Помилка перевірки статусу' },
      { status: 500 }
    );
  }
}
