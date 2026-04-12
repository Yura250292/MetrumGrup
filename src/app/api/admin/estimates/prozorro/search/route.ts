import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/auth-utils';
import { bidIntelligenceService } from '@/lib/services/bid-intelligence-service';
import { generateProzorroReport } from '@/lib/prozorro-matcher';
import type { BidIntelligenceResult } from '@/lib/types/bid-intelligence';

interface SearchRequestBody {
  estimateId: string;
  wizardData?: any;
  searchQuery?: string;
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    minScore?: number;
    limit?: number;
  };
}

/**
 * POST /api/admin/estimates/prozorro/search
 * Пошук схожих тендерів через BidIntelligenceService
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const allowedRoles = ['SUPER_ADMIN', 'MANAGER', 'ENGINEER', 'FINANCIER'];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const body: SearchRequestBody = await request.json();
    const { estimateId, wizardData, searchQuery, filters } = body;

    if (!estimateId) {
      return NextResponse.json({ error: 'estimateId is required' }, { status: 400 });
    }

    // Отримати кошторис з БД
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        project: true,
        sections: {
          include: {
            items: { select: { description: true } },
          },
        },
      },
    });

    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }

    const totalAmount = Number(estimate.totalAmount);

    console.log('🔍 Prozorro Bid Intelligence search:', {
      estimateId: estimate.id,
      searchQuery: searchQuery || '(auto)',
      budget: totalAmount,
    });

    // Виконати BidIntelligence аналіз
    const biResult: BidIntelligenceResult = await bidIntelligenceService.analyze({
      estimateAmount: totalAmount,
      wizardData: wizardData ? {
        objectType: wizardData.objectType,
        totalArea: wizardData.totalArea,
        floors: wizardData.houseData?.floors,
        commercialData: wizardData.commercialData,
      } : undefined,
      searchQuery,
      estimateTitle: estimate.title,
      estimateDescription: estimate.description || '',
      sections: estimate.sections.map(s => ({
        title: s.title,
        items: s.items.map(i => ({ description: i.description })),
      })),
    });

    console.log(`✅ BidIntelligence: ${biResult.allMatches.length} matches, ${biResult.budgetBands[0]?.tenders.length || 0} core`);

    // Зберегти matches та bid intelligence в БД
    if (biResult.allMatches.length > 0) {
      // Clear old matches
      await prisma.estimateTenderMatch.deleteMany({ where: { estimateId } });

      // Save new matches with budget band info
      const allBandedTenders = [
        ...biResult.budgetBands[0]?.tenders.map(t => ({ ...t, band: 'core' })) || [],
        ...biResult.budgetBands[1]?.tenders.map(t => ({ ...t, band: 'near' })) || [],
        ...biResult.budgetBands[2]?.tenders.map(t => ({ ...t, band: 'context' })) || [],
      ];

      for (const match of allBandedTenders.slice(0, 20)) {
        try {
          await prisma.estimateTenderMatch.create({
            data: {
              estimateId,
              tenderId: match.tenderID,
              similarityScore: match.similarityScore,
              matchReasons: Object.entries(match.scoreBreakdown).map(([k, v]) => `${k}: ${v}`),
              budgetBand: match.band,
            },
          });
        } catch {
          // tender might not be cached yet, skip
        }
      }

      // Оновити estimate з новими даними
      await prisma.estimate.update({
        where: { id: estimateId },
        data: {
          prozorroChecked: true,
          prozorroCheckedAt: new Date(),
          bidIntelligence: biResult as any,
          prozorroAnalysis: JSON.stringify({
            similarProjectsFound: biResult.searchMeta.totalFound,
            totalItemsParsed: Object.keys(biResult.priceDatabase).length,
            averagePriceLevel: 'medium',
            topSimilarProjects: biResult.allMatches.slice(0, 10).map(m => ({
              title: m.title,
              budget: m.budget,
              similarity: m.similarityScore,
              itemsCount: m.itemsCount,
              tenderID: m.tenderID,
              procuringEntity: m.procuringEntity,
              datePublished: m.datePublished,
              status: m.status,
            })),
            aggregatedLocations: biResult.aggregatedLocations,
            priceDatabase: biResult.priceDatabase,
          }),
        },
      });

      console.log(`✅ Saved bid intelligence for estimate ${estimateId}`);
    }

    return NextResponse.json({
      // Новий формат — bid intelligence
      bidIntelligence: biResult,
      // Legacy формат для backward compat
      matches: biResult.allMatches.slice(0, filters?.limit || 10).map(m => ({
        tender: {
          id: m.tenderID,
          title: m.title,
          status: m.status,
          valueAmount: m.budget,
          valueCurrency: 'UAH',
          procuringEntityName: m.procuringEntity,
          cpvCode: m.cpvCode,
          datePublished: m.datePublished,
          awardedAmount: m.awardedAmount || null,
        },
        similarityScore: m.similarityScore,
        matchReasons: Object.entries(m.scoreBreakdown).map(([k, v]) => `${k}: ${v}`),
        prozorroUrl: `https://prozorro.gov.ua/tender/${m.tenderID}`,
      })),
      searchParams: {
        budgetRange: [biResult.targetBudget * 0.7, biResult.targetBudget * 1.3],
        queries: biResult.searchMeta.queries,
      },
      totalFound: biResult.searchMeta.totalFound,
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
