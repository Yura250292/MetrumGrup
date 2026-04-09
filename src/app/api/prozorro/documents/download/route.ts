import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/auth-utils';
import { prozorroClient } from '@/lib/prozorro-client';

/**
 * POST /api/prozorro/documents/download
 * Завантажити документ з Prozorro
 *
 * Body: { documentUrl: string, fileName?: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Доступ для SUPER_ADMIN, MANAGER, ENGINEER, FINANCIER
  const allowedRoles = ['SUPER_ADMIN', 'MANAGER', 'ENGINEER', 'FINANCIER'];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const body = await request.json();
    const { documentUrl, fileName } = body;

    if (!documentUrl) {
      return NextResponse.json(
        { error: 'documentUrl is required' },
        { status: 400 }
      );
    }

    console.log(`📥 API: Завантаження документа: ${documentUrl}`);

    // Завантажити документ через Prozorro client
    const { content, contentType } = await prozorroClient.downloadDocument(documentUrl);

    // Визначити ім'я файлу
    const finalFileName = fileName || documentUrl.split('/').pop() || 'document';

    // Повернути файл
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${finalFileName}"`,
        'Content-Length': content.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('❌ API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to download document',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
