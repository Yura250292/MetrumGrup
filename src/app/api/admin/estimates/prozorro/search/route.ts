import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/auth-utils';
import { ProzorroClient } from '@/lib/prozorro-client';
import {
  extractSearchAttributes,
  calculateSimilarity,
  getDateForProzorroFilter,
  generateProzorroReport,
} from '@/lib/prozorro-matcher';
import { WizardData } from '@/lib/wizard-types';

interface SearchRequestBody {
  estimateId: string;
  wizardData?: WizardData;
  searchQuery?: string; // Опис від користувача для пошуку
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    minScore?: number;
    limit?: number;
  };
}

/**
 * POST /api/admin/estimates/prozorro/search
 * Пошук схожих тендерів на Prozorro для кошторису
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
    const body: SearchRequestBody = await request.json();
    const { estimateId, wizardData, searchQuery, filters } = body;

    // Валідація
    if (!estimateId) {
      return NextResponse.json(
        { error: 'estimateId is required' },
        { status: 400 }
      );
    }

    // Отримати кошторис з БД
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        project: true,
        sections: {
          include: {
            items: {
              select: {
                description: true,
              },
            },
          },
        },
      },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: 'Estimate not found' },
        { status: 404 }
      );
    }

    // Витягти атрибути для пошуку
    const searchAttrs = extractSearchAttributes(estimate, wizardData, searchQuery);

    console.log('🔍 Пошук Prozorro тендерів:', {
      estimateId: estimate.id,
      searchQuery: searchQuery || '(auto)',
      budget: searchAttrs.budgetCenter,
      budgetRange: [searchAttrs.budgetMin, searchAttrs.budgetMax],
      cpvCode: searchAttrs.cpvCode,
      area: searchAttrs.area,
      keywordsCount: searchAttrs.keywords.length,
    });

    // Пошук на Prozorro
    const prozorroClient = new ProzorroClient();
    const dateFrom = filters?.dateFrom || getDateForProzorroFilter(6); // За замовчуванням 6 міс
    const dateTo = filters?.dateTo;

    const tenders = await prozorroClient.searchTenders({
      classification: searchAttrs.cpvCode,
      valueAmount: `>=${searchAttrs.budgetMin},<=${searchAttrs.budgetMax}`,
      status: 'complete', // Тільки завершені тендери
      dateModified: `>=${dateFrom}${dateTo ? `,<=${dateTo}` : ''}`,
      limit: 50, // Отримуємо більше для фільтрації
    });

    console.log(`✅ Знайдено ${tenders.length} тендерів на Prozorro`);

    // Розрахувати схожість та ранжувати
    const matches = tenders
      .map(tender => {
        const { score, reasons } = calculateSimilarity(searchAttrs, tender);
        return {
          tender,
          similarityScore: score,
          matchReasons: reasons,
          prozorroUrl: `https://prozorro.gov.ua/tender/${tender.id}`,
        };
      })
      .filter(m => m.similarityScore >= (filters?.minScore || 60))
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, filters?.limit || 10);

    console.log(`✅ Відфільтровано до ${matches.length} релевантних тендерів`);

    // Зберегти результати в БД для кешування
    if (matches.length > 0) {
      await saveMatchesToDB(estimateId, matches);

      // Генерувати текстовий звіт для інженера
      const prozorroReport = generateProzorroReport(
        matches.map(m => ({
          tender: m.tender,
          score: m.similarityScore,
          reasons: m.matchReasons,
        }))
      );

      // Оновити estimate з Prozorro аналізом
      await prisma.estimate.update({
        where: { id: estimateId },
        data: {
          prozorroChecked: true,
          prozorroCheckedAt: new Date(),
          prozorroAnalysis: prozorroReport,
        },
      });

      console.log(`✅ Збережено Prozorro аналіз до estimate ${estimateId}`);
    }

    return NextResponse.json({
      matches: matches.map(m => ({
        tender: {
          id: m.tender.id,
          title: m.tender.title,
          description: m.tender.description,
          status: m.tender.status,
          valueAmount: m.tender.value.amount,
          valueCurrency: m.tender.value.currency,
          procuringEntityName: m.tender.procuringEntity.name,
          cpvCode: m.tender.classification.id,
          cpvDescription: m.tender.classification.description,
          datePublished: m.tender.datePublished,
          awardedAmount: m.tender.awards?.find(a => a.status === 'active')?.value.amount || null,
        },
        similarityScore: m.similarityScore,
        matchReasons: m.matchReasons,
        prozorroUrl: m.prozorroUrl,
      })),
      searchParams: {
        budgetRange: [searchAttrs.budgetMin, searchAttrs.budgetMax],
        cpvCode: searchAttrs.cpvCode,
        keywords: searchAttrs.keywords,
        area: searchAttrs.area,
      },
      totalFound: tenders.length,
      cached: false,
    });
  } catch (error) {
    console.error('❌ Помилка пошуку Prozorro:', error);
    return NextResponse.json(
      {
        error: 'Failed to search Prozorro tenders',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Зберегти matches в БД для кешування
 */
async function saveMatchesToDB(
  estimateId: string,
  matches: Array<{
    tender: any;
    similarityScore: number;
    matchReasons: string[];
  }>
): Promise<void> {
  try {
    // Видалити старі matches
    await prisma.estimateTenderMatch.deleteMany({
      where: { estimateId },
    });

    // Створити нові matches
    for (const match of matches) {
      await prisma.estimateTenderMatch.create({
        data: {
          estimateId,
          tenderId: match.tender.id,
          similarityScore: match.similarityScore,
          matchReasons: match.matchReasons,
        },
      });
    }

    console.log(`✅ Збережено ${matches.length} matches в БД`);
  } catch (error) {
    console.error('⚠️ Помилка збереження matches:', error);
    // Не кидаємо помилку - кешування не критичне
  }
}
