/**
 * API для генерації presigned URLs для прямого завантаження в R2
 * Обхід Vercel 4.5MB ліміту - файли завантажуються НАПРЯМУ з браузера в R2
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPresignedUploadUrl, isR2Configured } from '@/lib/r2-client';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    console.log('🔑 Presigned URL request received');

    // Перевірка чи налаштований R2
    if (!isR2Configured()) {
      return NextResponse.json(
        {
          error: 'R2 not configured',
          message: 'Cloudflare R2 credentials missing in environment variables',
        },
        { status: 500 }
      );
    }

    // Отримуємо список файлів (тільки метадані, не самі файли!)
    const body = await request.json();
    const { files, estimateId } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: 'No files metadata provided' },
        { status: 400 }
      );
    }

    console.log(`🔑 Creating presigned URLs for ${files.length} files...`);

    // Генеруємо presigned URL для кожного файлу
    const presignedUrls = await Promise.all(
      files.map(async (file: { name: string; type: string; size: number }) => {
        const { uploadUrl, key } = await createPresignedUploadUrl(
          file.name,
          file.type,
          estimateId
        );

        return {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          uploadUrl,   // URL для завантаження (PUT request з браузера)
          key,         // Ключ файлу в R2
        };
      })
    );

    console.log(`✅ Created ${presignedUrls.length} presigned URLs`);

    return NextResponse.json({
      success: true,
      presignedUrls,
    });

  } catch (error) {
    console.error('❌ Presigned URL generation error:', error);

    return NextResponse.json(
      {
        error: 'Failed to create presigned URLs',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
