import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';

/**
 * Генерує presigned URLs для прямого завантаження в R2
 * POST /api/admin/estimates/upload-presigned
 *
 * Body: { files: Array<{ name: string; type: string; size: number }> }
 * Returns: { uploads: Array<{ key: string; url: string; fields: {} }> }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { files } = await request.json();

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: 'Invalid request: files array required' },
        { status: 400 }
      );
    }

    console.log(`📝 Generating ${files.length} presigned URLs for R2 upload...`);

    // Генеруємо presigned URL для кожного файлу
    const uploads = await Promise.all(
      files.map(async (file: { name: string; type: string; size: number }) => {
        // Унікальний ключ для R2
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const key = `uploads/${session.user.id}/${timestamp}_${sanitizedName}`;

        // Створюємо команду для PutObject
        // ВАЖЛИВО: Не вказуємо ContentLength, щоб браузер сам встановив header
        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          ContentType: file.type,
          // ContentLength НЕ вказуємо - інакше підпис не співпаде з браузерним запитом
          Metadata: {
            originalName: file.name,
            uploadedBy: session.user.id,
            uploadedAt: new Date().toISOString(),
          },
        });

        // Генеруємо presigned URL (дійсний 1 годину)
        const url = await getSignedUrl(s3Client, command, {
          expiresIn: 3600, // 1 година
        });

        return {
          key,
          url,
          originalName: file.name,
          contentType: file.type,
          size: file.size,
        };
      })
    );

    console.log(`✅ Generated ${uploads.length} presigned URLs`);

    return NextResponse.json({
      success: true,
      uploads,
    });

  } catch (error) {
    console.error('❌ Error generating presigned URLs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
