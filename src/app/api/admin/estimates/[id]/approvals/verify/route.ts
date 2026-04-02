import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { verifyApprovalIntegrity } from '@/lib/approval-tracking';

/**
 * POST /api/admin/estimates/[id]/approvals/verify
 *
 * Верифікувати цифровий підпис апрувалу
 * Body: { approvalId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const { approvalId } = body;

    if (!approvalId) {
      return NextResponse.json(
        { error: 'approvalId is required' },
        { status: 400 }
      );
    }

    // Верифікувати підпис
    const verification = await verifyApprovalIntegrity(approvalId);

    return NextResponse.json(verification);
  } catch (error: any) {
    console.error('Error verifying approval:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify approval' },
      { status: 500 }
    );
  }
}
