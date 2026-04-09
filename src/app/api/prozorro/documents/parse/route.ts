import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/auth-utils';
import { prozorroClient } from '@/lib/prozorro-client';
import { parseExcelEstimate } from '@/lib/parsers/excel-estimate-parser';
import { prisma } from '@/lib/prisma';

interface ParseRequestBody {
  tenderId: string;
  documentId: string;
  documentUrl: string;
  documentTitle: string;
  documentFormat: string;
}

/**
 * POST /api/prozorro/documents/parse
 * Розпарсити кошторис з документа Prozorro
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
    const body: ParseRequestBody = await request.json();
    const { tenderId, documentId, documentUrl, documentTitle, documentFormat } = body;

    // Валідація
    if (!tenderId || !documentId || !documentUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`🤖 Парсинг документа: ${documentTitle} (${documentFormat})`);

    // Перевірити чи вже розпарсено
    const existing = await prisma.prozorroEstimateData.findFirst({
      where: {
        tenderId,
        documentId,
      },
      include: {
        items: true,
      },
    });

    if (existing) {
      console.log(`✅ Документ вже розпарсено (${existing.items.length} позицій)`);
      return NextResponse.json({
        success: true,
        cached: true,
        data: existing,
      });
    }

    // Отримати тендер для метаданих
    const tender = await prozorroClient.getTenderDetails(tenderId);

    // Завантажити файл
    const { content: fileBuffer } = await prozorroClient.downloadDocument(documentUrl);

    console.log(`📥 Файл завантажено (${fileBuffer.byteLength} bytes)`);

    // Визначити тип файлу та парсити
    let parseResult;

    if (documentFormat.includes('spreadsheet') || documentFormat.includes('excel') ||
        documentTitle.endsWith('.xlsx') || documentTitle.endsWith('.xls')) {
      // Excel файл
      console.log('📊 Парсинг Excel файлу...');
      parseResult = await parseExcelEstimate(fileBuffer);
    } else if (documentFormat.includes('pdf') || documentTitle.endsWith('.pdf')) {
      // PDF файл - поки що не підтримується
      return NextResponse.json({
        success: false,
        error: 'PDF парсинг ще не реалізовано. Скоро додамо!',
      }, { status: 501 });
    } else {
      return NextResponse.json({
        success: false,
        error: `Непідтримуваний формат файлу: ${documentFormat}`,
      }, { status: 400 });
    }

    if (!parseResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Не вдалося розпарсити документ',
        details: parseResult.errors,
      }, { status: 400 });
    }

    console.log(`✅ Парсинг завершено: ${parseResult.items.length} позицій`);

    // Зберегти в БД
    const estimateData = await prisma.prozorroEstimateData.create({
      data: {
        tenderId,
        tenderTitle: tender.title,
        awardedAmount: tender.awards?.find(a => a.status === 'active')?.value.amount || tender.value.amount,
        datePublished: new Date(tender.datePublished),
        documentId,
        documentUrl,
        documentTitle,
        documentFormat,
        parseStatus: parseResult.errors.length > 0 ? 'partial' : 'success',
        parseErrors: parseResult.errors.length > 0 ? parseResult.errors : null,
        totalItems: parseResult.items.length,
        totalAmount: parseResult.totalAmount,
        items: {
          create: parseResult.items.map(item => ({
            rowNumber: item.rowNumber,
            category: item.category,
            code: item.code,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            notes: item.notes,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    console.log(`💾 Збережено в БД: ${estimateData.items.length} позицій`);

    return NextResponse.json({
      success: true,
      cached: false,
      data: estimateData,
      metadata: parseResult.metadata,
    });
  } catch (error) {
    console.error('❌ API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse document',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
