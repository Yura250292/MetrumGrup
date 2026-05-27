/**
 * API для завантаження файлів в Cloudflare R2
 * Використовується на продакшені для обходу 413 Payload Too Large
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadFilesToR2, shouldUseR2, isR2Configured } from '@/lib/r2-client';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 хвилин

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Upload to R2 request received');

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

    // Чи потрібно використовувати R2 (тільки на продакшені)
    if (!shouldUseR2()) {
      return NextResponse.json(
        {
          error: 'R2 not needed',
          message: 'R2 should only be used in production',
          useDirectUpload: true,
        },
        { status: 400 }
      );
    }

    // Отримуємо файли з FormData
    const formData = await request.formData();
    const files: File[] = [];

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    console.log(`📦 Uploading ${files.length} files to R2...`);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    console.log(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    // Завантажуємо в R2
    const estimateId = formData.get('estimateId') as string | undefined;
    const uploadedFiles = await uploadFilesToR2(files, estimateId);

    console.log(`✅ Successfully uploaded ${uploadedFiles.length} files to R2`);

    return NextResponse.json({
      success: true,
      files: uploadedFiles,
      totalFiles: uploadedFiles.length,
      totalSize,
    });

  } catch (error) {
    console.error('❌ R2 upload error:', error);

    return NextResponse.json(
      {
        error: 'Upload failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
