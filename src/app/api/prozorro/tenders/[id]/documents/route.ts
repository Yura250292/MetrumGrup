import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/auth-utils';
import { prozorroClient } from '@/lib/prozorro-client';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/prozorro/tenders/[id]/documents
 * Отримати список документів тендера (кошториси, специфікації)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Доступ для SUPER_ADMIN, MANAGER, ENGINEER, FINANCIER
  const allowedRoles = ['SUPER_ADMIN', 'MANAGER', 'ENGINEER', 'FINANCIER'];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const { id: tenderId } = params;
    const { searchParams } = new URL(request.url);
    const filterType = searchParams.get('type'); // 'billOfQuantity' or 'all'

    console.log(`📄 API: Отримання документів тендера ${tenderId}, filter: ${filterType || 'all'}`);

    // Отримати документи через Prozorro client
    const documents = filterType === 'billOfQuantity'
      ? await prozorroClient.getTenderEstimates(tenderId)
      : await prozorroClient.getTenderDocuments(tenderId);

    // Класифікувати документи за типом
    const estimates = documents.filter(d => d.documentType === 'billOfQuantity');
    const specifications = documents.filter(d => d.documentType === 'technicalSpecifications');
    const other = documents.filter(d =>
      d.documentType !== 'billOfQuantity' &&
      d.documentType !== 'technicalSpecifications'
    );

    return NextResponse.json({
      tenderId,
      total: documents.length,
      documents,
      categorized: {
        estimates: {
          count: estimates.length,
          items: estimates,
        },
        specifications: {
          count: specifications.length,
          items: specifications,
        },
        other: {
          count: other.length,
          items: other,
        },
      },
    });
  } catch (error) {
    console.error('❌ API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch tender documents',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
