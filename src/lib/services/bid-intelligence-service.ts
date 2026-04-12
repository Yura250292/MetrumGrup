/**
 * Bid Intelligence Service
 *
 * Уніфікований сервіс Prozorro-аналізу для:
 * 1. Оцінки ціни входу в торги (budget bands ±10/20/30%)
 * 2. Аналізу ціни переможця (winner price analysis)
 * 3. Рекомендацій entry price (aggressive / recommended / conservative)
 * 4. Ринкових сигналів (competition level, region, trend)
 *
 * Замінює обидва попередні Prozorro pipeline:
 * - pre-analysis-agent.ts (analyzeProzorroTenders)
 * - prozorro/search/route.ts (manual search)
 */

import { prozorroClient } from '../prozorro-client';
import { extractSearchAttributes, mapObjectTypeToCPV, extractAreaFromDescription } from '../prozorro-matcher';
import { prisma } from '../prisma';
import type {
  BidIntelligenceInput,
  BidIntelligenceResult,
  EnrichedTenderMatch,
  BudgetBand,
  WinnerPriceAnalysis,
  EntryPriceRecommendation,
  MarketSignals,
  AggregatedLocationData,
} from '../types/bid-intelligence';

// ============================================================
// TYPES для внутрішнього використання
// ============================================================

interface RawTender {
  id?: string;
  tenderID: string;
  title: string;
  description?: string;
  value: { amount: number; currency: string; valueAddedTaxIncluded?: boolean };
  procuringEntity: { name: string; identifier?: any; address?: { locality?: string } };
  status: string;
  datePublished?: string;
  dateModified?: string;
  awards?: Array<{ value: { amount: number }; status: string }>;
  classification?: { id: string; description: string };
}

// ============================================================
// SERVICE
// ============================================================

export class BidIntelligenceService {
  /**
   * Main entry: виконує повний аналіз bid intelligence
   */
  async analyze(input: BidIntelligenceInput): Promise<BidIntelligenceResult> {
    console.log('🧠 BidIntelligence: Starting analysis...');

    const targetBudget = input.estimateAmount;

    // 1. Search tenders via multi-query
    const searchQuery = input.searchQuery || this.buildDefaultQuery(input);
    const multiQueries = this.buildMultiQueries(searchQuery);
    console.log(`🔍 BidIntelligence: ${multiQueries.length} queries: ${multiQueries.join(' | ')}`);

    const rawTenders = await this.searchWithMultiQuery(multiQueries);
    console.log(`📊 BidIntelligence: ${rawTenders.length} unique tenders found`);

    // 2. Enrich with parsed estimates data
    const tenderIds = rawTenders
      .map(t => t.tenderID || t.id)
      .filter((id): id is string => !!id);

    const parsedEstimates = await this.fetchParsedEstimates(tenderIds);

    // 3. Score and enrich each tender
    const allMatches = rawTenders
      .map(t => this.scoreTender(t, input, parsedEstimates))
      .filter((m): m is EnrichedTenderMatch => m !== null)
      .sort((a, b) => b.similarityScore - a.similarityScore);

    console.log(`✅ BidIntelligence: ${allMatches.length} scored matches`);

    // 4. Group by budget bands
    const budgetBands = this.groupByBudgetBand(allMatches, targetBudget);

    // 5. Analyze winner prices
    const winnerAnalysis = this.analyzeWinnerPrices(allMatches, targetBudget);

    // 6. Calculate entry price recommendation
    const entryPrice = this.calculateEntryPrice(winnerAnalysis, targetBudget);

    // 7. Assess market signals
    const marketSignals = this.assessMarketSignals(allMatches);

    // 8. Aggregate locations
    const aggregatedLocations = this.aggregateByLocation(allMatches, rawTenders);

    // 9. Build price database from parsed items
    const priceDatabase = this.buildPriceDatabase(parsedEstimates);

    const result: BidIntelligenceResult = {
      targetBudget,
      budgetBands,
      winnerAnalysis,
      entryPrice,
      marketSignals,
      allMatches: allMatches.slice(0, 20),
      aggregatedLocations,
      priceDatabase,
      searchMeta: {
        queries: multiQueries,
        totalFound: rawTenders.length,
        searchedAt: new Date().toISOString(),
      },
    };

    console.log(`🧠 BidIntelligence: Done. Core=${budgetBands[0]?.tenders.length || 0}, Near=${budgetBands[1]?.tenders.length || 0}, Context=${budgetBands[2]?.tenders.length || 0}`);
    return result;
  }

  // ============================================================
  // SEARCH
  // ============================================================

  private async searchWithMultiQuery(queries: string[]): Promise<RawTender[]> {
    const results = await Promise.all(
      queries.map(q =>
        prozorroClient.searchTendersByText({
          text: q,
          perPage: 20,
          classification: '45000000', // Construction works CPV
        }).catch(() => [])
      )
    );

    const seen = new Set<string>();
    return results.flat().filter(t => {
      const key = t.tenderID || t.id || '';
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }) as RawTender[];
  }

  private buildMultiQueries(searchQuery: string): string[] {
    const trimmed = searchQuery.trim();
    const queries = new Set<string>();

    queries.add(trimmed);

    // Завжди додаємо "будівництво" якщо немає
    if (!/будівниц|реконструк|капітальн.*ремонт/i.test(trimmed)) {
      queries.add(`будівництво ${trimmed}`);
    }

    // АТБ / магазин / супермаркет → шукаємо будівництво торгових об'єктів
    if (/АТБ/i.test(trimmed)) {
      queries.add('будівництво торгівельного приміщення магазину');
      queries.add('будівництво супермаркету');
    } else if (/магазин|супермаркет|торгів/i.test(trimmed)) {
      queries.add('будівництво торгівельного приміщення');
      queries.add('нове будівництво магазину');
    }

    // Квартира/офіс → ремонт
    if (/квартир|приміщенн|офіс/i.test(trimmed) && !/ремонт/i.test(trimmed)) {
      queries.add(`капітальний ремонт ${trimmed}`);
    }

    return Array.from(queries).slice(0, 5);
  }

  private buildDefaultQuery(input: BidIntelligenceInput): string {
    const wd = input.wizardData;
    const workScopeMap: Record<string, string> = {
      new_construction: 'Будівництво',
      renovation: 'Капітальний ремонт',
      finishing: 'Оздоблювальні роботи',
      reconstruction: 'Реконструкція',
    };

    const objectTypeMap: Record<string, string> = {
      apartment: 'квартири',
      house: 'житлового будинку',
      townhouse: 'таунхаусу',
      commercial: 'комерційного приміщення',
      office: 'офісного приміщення',
    };

    const workPrefix = workScopeMap[wd?.workScope || ''] || 'Будівництво';
    const objectSuffix = objectTypeMap[wd?.objectType || ''] || 'будівлі';

    let query = `${workPrefix} ${objectSuffix}`;

    // Комерція з конкретним призначенням
    const commercialData = wd?.commercialData;
    if (wd?.objectType === 'commercial' && commercialData?.purpose) {
      const purposeMap: Record<string, string> = {
        shop: 'торгівельного приміщення магазину',
        warehouse: 'складського приміщення',
        restaurant: 'ресторану кафе',
        factory: 'виробничого приміщення',
        showroom: 'торгівельного залу',
      };
      const purpose = purposeMap[commercialData.purpose] || commercialData.purpose;
      query = `${workPrefix} ${purpose}`;
    }

    return query;
  }

  // ============================================================
  // SCORING — new 6-factor model
  // ============================================================

  private scoreTender(
    tender: RawTender,
    input: BidIntelligenceInput,
    parsedEstimates: any[]
  ): EnrichedTenderMatch | null {
    const budget = tender.value?.amount;
    if (!budget || budget <= 0) return null;

    const awardedAmount = tender.awards?.find(a => a.status === 'active')?.value?.amount;
    const tenderKey = tender.tenderID || tender.id || '';
    const parsed = parsedEstimates.find((e: any) => e.tenderId === tenderKey);
    const targetBudget = input.estimateAmount;
    const cpvCode = input.wizardData?.objectType ? mapObjectTypeToCPV(input.wizardData.objectType as any) : '45000000';

    // 1. Budget proximity (max 35)
    let budgetProximity = 0;
    if (targetBudget > 0) {
      const diff = Math.abs(budget - targetBudget) / targetBudget;
      budgetProximity = Math.max(0, 35 * (1 - diff));
    } else {
      budgetProximity = 17; // neutral if no target
    }

    // 2. Scope similarity via keywords (max 25)
    const keywords = this.extractKeywords(input);
    const tenderText = `${tender.title || ''} ${tender.description || ''}`.toLowerCase();
    const matchedKw = keywords.filter(kw => tenderText.includes(kw));
    const scopeSimilarity = keywords.length > 0
      ? Math.round((matchedKw.length / keywords.length) * 25)
      : 0;

    // Filter: skip irrelevant tenders
    if (scopeSimilarity === 0 && budgetProximity < 15) return null;

    // Penalty for non-construction categories — STRICT filter
    const nonConstructionPatterns = /зброя|харчування|продукти|обладнання навчальне|медичне обладнання|автобус|паливо|іграшк|ігров|меблі|рекламн|маркетинг|канцеляр|комп'ютер|програмн|ліки|медикамент|продовольч|одяг|взуття|книг|підручник|друкован|прибиранн|прального|пральн|охорон|страхув|аудит|юридич|консультац|навчальн.*послуг|тренінг/i;
    if (nonConstructionPatterns.test(tender.title || '')) return null;

    // Must be construction-related CPV (45xxxxxx) or at least have some keyword match
    const tenderCPVPrefix = (tender.classification?.id || '').slice(0, 2);
    const isConstructionCPV = tenderCPVPrefix === '45';
    if (!isConstructionCPV && scopeSimilarity < 5) return null;

    // 3. Winner price availability (max 10)
    const winnerAvailability = awardedAmount ? 10 : 0;

    // 4. Region similarity (max 10)
    // Basic: if we have city info and it matches search context
    const region = 5; // neutral for now — will be improved with user region

    // 5. Recency (max 10)
    let recency = 5;
    if (tender.datePublished) {
      const ageMonths = (Date.now() - new Date(tender.datePublished).getTime()) / (30 * 24 * 3600000);
      if (ageMonths <= 6) recency = 10;
      else if (ageMonths <= 12) recency = 7;
      else if (ageMonths <= 24) recency = 4;
      else recency = 2;
    }

    // 6. CPV relevance (max 10)
    let cpvScore = 0;
    const tenderCPV = tender.classification?.id || '';
    if (cpvCode === tenderCPV) cpvScore = 10;
    else if (cpvCode.slice(0, 4) === tenderCPV.slice(0, 4)) cpvScore = 7;
    else if (cpvCode.slice(0, 2) === tenderCPV.slice(0, 2)) cpvScore = 5;

    const totalScore = Math.round(budgetProximity + scopeSimilarity + winnerAvailability + region + recency + cpvScore);

    // Minimum threshold — higher when no budget target (pre-analysis phase)
    const minThreshold = targetBudget > 0 ? 20 : 30;
    if (totalScore < minThreshold) return null;

    // Must have at least SOME scope match OR strong CPV match for construction
    if (scopeSimilarity === 0 && cpvScore < 5) return null;

    const discount = awardedAmount && budget > 0
      ? -((budget - awardedAmount) / budget * 100)
      : undefined;

    const city = this.extractCity(tender);

    return {
      tenderID: tenderKey,
      title: tender.title || tenderKey,
      budget,
      awardedAmount,
      discount: discount ? Math.round(discount * 10) / 10 : undefined,
      similarityScore: totalScore,
      scoreBreakdown: {
        budgetProximity: Math.round(budgetProximity * 10) / 10,
        scopeSimilarity,
        winnerAvailability,
        region,
        recency,
        cpv: cpvScore,
      },
      procuringEntity: tender.procuringEntity?.name,
      datePublished: tender.datePublished,
      status: tender.status,
      city,
      cpvCode: tenderCPV,
      itemsCount: parsed?.totalItems || 0,
    };
  }

  private extractKeywords(input: BidIntelligenceInput): string[] {
    const words: string[] = [];
    const stopWords = new Set(['та', 'і', 'на', 'з', 'для', 'по', 'в', 'у', 'це', 'як', 'що', 'до']);

    if (input.searchQuery) {
      words.push(...input.searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    }
    if (input.estimateTitle) {
      words.push(...input.estimateTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    }

    if (input.wizardData?.objectType === 'commercial' && input.wizardData?.commercialData?.purpose === 'shop') {
      words.push('супермаркет', 'магазин', 'торгівля');
    }
    if (input.wizardData?.commercialData?.hvac) {
      words.push('холодильна', 'вентиляція', 'кондиціонування');
    }

    if (input.sections) {
      for (const sec of input.sections) {
        words.push(...sec.title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      }
    }

    return [...new Set(words)].filter(w => !stopWords.has(w)).slice(0, 30);
  }

  // ============================================================
  // BUDGET BANDS
  // ============================================================

  private groupByBudgetBand(matches: EnrichedTenderMatch[], center: number): BudgetBand[] {
    const core: EnrichedTenderMatch[] = [];
    const near: EnrichedTenderMatch[] = [];
    const context: EnrichedTenderMatch[] = [];

    // Якщо немає target budget — всі тендери йдуть в context
    if (center <= 0) {
      return [
        { label: 'core', range: { min: 0, max: 0 }, percentage: 10, tenders: [] },
        { label: 'near', range: { min: 0, max: 0 }, percentage: 20, tenders: [] },
        { label: 'context', range: { min: 0, max: 0 }, percentage: 30, tenders: matches.sort((a, b) => b.similarityScore - a.similarityScore) },
      ];
    }

    for (const m of matches) {
      const diff = Math.abs(m.budget - center) / center;
      if (diff <= 0.1) {
        core.push(m);
      } else if (diff <= 0.2) {
        near.push(m);
      } else if (diff <= 0.3) {
        context.push(m);
      }
      // > 30% — не включаємо в bands (залишаються в allMatches)
    }

    return [
      {
        label: 'core',
        range: { min: center * 0.9, max: center * 1.1 },
        percentage: 10,
        tenders: core.sort((a, b) => b.similarityScore - a.similarityScore),
      },
      {
        label: 'near',
        range: { min: center * 0.8, max: center * 1.2 },
        percentage: 20,
        tenders: near.sort((a, b) => b.similarityScore - a.similarityScore),
      },
      {
        label: 'context',
        range: { min: center * 0.7, max: center * 1.3 },
        percentage: 30,
        tenders: context.sort((a, b) => b.similarityScore - a.similarityScore),
      },
    ];
  }

  // ============================================================
  // WINNER PRICE ANALYSIS
  // ============================================================

  private analyzeWinnerPrices(matches: EnrichedTenderMatch[], targetBudget: number): WinnerPriceAnalysis {
    const withWinners = matches.filter(m => m.awardedAmount && m.awardedAmount > 0);

    if (withWinners.length === 0) {
      return {
        medianWinnerPrice: 0,
        avgDiscount: 0,
        minDiscount: 0,
        maxDiscount: 0,
        winCorridor: { low: 0, high: 0 },
        sampleSize: 0,
      };
    }

    const winnerPrices = withWinners.map(m => m.awardedAmount!).sort((a, b) => a - b);
    const discounts = withWinners
      .filter(m => m.budget > 0)
      .map(m => ((m.budget - m.awardedAmount!) / m.budget) * 100);

    const median = winnerPrices[Math.floor(winnerPrices.length / 2)];
    const avgDiscount = discounts.length > 0
      ? discounts.reduce((s, d) => s + d, 0) / discounts.length
      : 0;
    const minDiscount = discounts.length > 0 ? Math.min(...discounts) : 0;
    const maxDiscount = discounts.length > 0 ? Math.max(...discounts) : 0;

    // Win corridor: 25th to 75th percentile of winner prices
    const p25 = winnerPrices[Math.floor(winnerPrices.length * 0.25)] || winnerPrices[0];
    const p75 = winnerPrices[Math.floor(winnerPrices.length * 0.75)] || winnerPrices[winnerPrices.length - 1];

    return {
      medianWinnerPrice: median,
      avgDiscount: Math.round(avgDiscount * 10) / 10,
      minDiscount: Math.round(minDiscount * 10) / 10,
      maxDiscount: Math.round(maxDiscount * 10) / 10,
      winCorridor: { low: p25, high: p75 },
      sampleSize: withWinners.length,
    };
  }

  // ============================================================
  // ENTRY PRICE RECOMMENDATION
  // ============================================================

  private calculateEntryPrice(winner: WinnerPriceAnalysis, targetBudget: number): EntryPriceRecommendation {
    // Якщо немає target budget (pre-analysis фаза) — використовуємо медіану переможців
    const effectiveBudget = targetBudget > 0
      ? targetBudget
      : winner.medianWinnerPrice > 0
        ? winner.medianWinnerPrice
        : 0;

    if (winner.sampleSize === 0 || effectiveBudget === 0) {
      return {
        recommended: { min: effectiveBudget * 0.90, max: effectiveBudget * 0.97 },
        aggressive: { min: effectiveBudget * 0.82, max: effectiveBudget * 0.88 },
        conservative: { min: effectiveBudget * 0.95, max: effectiveBudget * 1.02 },
        basedOnWinnersMedian: winner.medianWinnerPrice,
        basedOnExpectedMedian: effectiveBudget,
        basis: targetBudget === 0
          ? 'Аналіз ціни входу буде доступний після генерації кошторису (потрібна цільова сума).'
          : 'Немає даних по переможцях — рекомендації базуються на цільовому бюджеті.',
      };
    }

    const medianDiscount = winner.avgDiscount / 100;
    const recommendedCenter = targetBudget * (1 - medianDiscount);
    const spread = targetBudget * 0.03; // ±3% від рекомендованого

    const aggressiveDiscount = Math.min(medianDiscount + 0.05, winner.maxDiscount / 100);
    const conservativeDiscount = Math.max(medianDiscount - 0.03, 0);

    return {
      recommended: {
        min: Math.round(recommendedCenter - spread),
        max: Math.round(recommendedCenter + spread),
      },
      aggressive: {
        min: Math.round(targetBudget * (1 - aggressiveDiscount - 0.02)),
        max: Math.round(targetBudget * (1 - aggressiveDiscount + 0.02)),
      },
      conservative: {
        min: Math.round(targetBudget * (1 - conservativeDiscount - 0.02)),
        max: Math.round(targetBudget * (1 - conservativeDiscount + 0.02)),
      },
      basedOnWinnersMedian: winner.medianWinnerPrice,
      basedOnExpectedMedian: targetBudget,
      basis: `Базується на ${winner.sampleSize} тендерах з відомою ціною переможця. Середня знижка: ${winner.avgDiscount}%.`,
    };
  }

  // ============================================================
  // MARKET SIGNALS
  // ============================================================

  private assessMarketSignals(matches: EnrichedTenderMatch[]): MarketSignals {
    if (matches.length === 0) {
      return {
        competitionLevel: 'medium',
        avgBiddersPerTender: 0,
        regionFactor: 'Недостатньо даних',
        dateFactor: 'Недостатньо даних',
        trendDirection: 'stable',
      };
    }

    // Competition level based on discount distribution
    const discounts = matches
      .filter(m => m.discount !== undefined)
      .map(m => Math.abs(m.discount!));

    const avgDiscount = discounts.length > 0
      ? discounts.reduce((s, d) => s + d, 0) / discounts.length
      : 0;

    let competitionLevel: 'low' | 'medium' | 'high';
    if (avgDiscount > 15) competitionLevel = 'high';
    else if (avgDiscount > 7) competitionLevel = 'medium';
    else competitionLevel = 'low';

    // Date trend: compare recent (< 6 months) vs older prices
    const now = Date.now();
    const recent = matches.filter(m => m.datePublished && (now - new Date(m.datePublished).getTime()) < 180 * 24 * 3600000);
    const older = matches.filter(m => m.datePublished && (now - new Date(m.datePublished).getTime()) >= 180 * 24 * 3600000);

    let trendDirection: 'rising' | 'stable' | 'falling' = 'stable';
    if (recent.length > 2 && older.length > 2) {
      const recentAvg = recent.reduce((s, m) => s + m.budget, 0) / recent.length;
      const olderAvg = older.reduce((s, m) => s + m.budget, 0) / older.length;
      const change = (recentAvg - olderAvg) / olderAvg;
      if (change > 0.1) trendDirection = 'rising';
      else if (change < -0.1) trendDirection = 'falling';
    }

    return {
      competitionLevel,
      avgBiddersPerTender: 0, // API doesn't provide bidder count directly
      regionFactor: this.getRegionSummary(matches),
      dateFactor: trendDirection === 'rising' ? 'Ціни зростають' : trendDirection === 'falling' ? 'Ціни падають' : 'Стабільні ціни',
      trendDirection,
    };
  }

  private getRegionSummary(matches: EnrichedTenderMatch[]): string {
    const cities = matches.filter(m => m.city).map(m => m.city!);
    if (cities.length === 0) return 'Недостатньо даних';

    const cityCount = new Map<string, number>();
    for (const c of cities) {
      cityCount.set(c, (cityCount.get(c) || 0) + 1);
    }

    const topCities = [...cityCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([city]) => city);

    return `Основні регіони: ${topCities.join(', ')}`;
  }

  // ============================================================
  // LOCATION AGGREGATION
  // ============================================================

  private aggregateByLocation(matches: EnrichedTenderMatch[], rawTenders: RawTender[]): AggregatedLocationData[] {
    const groups = new Map<string, EnrichedTenderMatch[]>();

    for (const m of matches) {
      const city = m.city || 'Невідомо';
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city)!.push(m);
    }

    return Array.from(groups.entries())
      .filter(([city]) => city !== 'Невідомо')
      .map(([city, tenders]) => ({
        location: city,
        city,
        totalAmount: tenders.reduce((sum, t) => sum + t.budget, 0),
        tenderCount: tenders.length,
        tenders: tenders
          .sort((a, b) => b.budget - a.budget)
          .map(t => ({
            title: t.title,
            amount: t.budget,
            tenderID: t.tenderID,
            status: t.status || 'unknown',
          })),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);
  }

  // ============================================================
  // PRICE DATABASE
  // ============================================================

  private buildPriceDatabase(parsedEstimates: any[]): Record<string, number> {
    const categories = new Map<string, { sum: number; count: number }>();

    for (const est of parsedEstimates) {
      for (const item of (est.items || [])) {
        const category = item.category || 'general';
        const price = parseFloat(item.unitPrice?.toString() || '0');
        if (price <= 0) continue;

        const curr = categories.get(category) || { sum: 0, count: 0 };
        curr.sum += price;
        curr.count += 1;
        categories.set(category, curr);
      }
    }

    const result: Record<string, number> = {};
    for (const [cat, { sum, count }] of categories) {
      if (!cat.endsWith('_count')) {
        result[cat] = Math.round((sum / count) * 100) / 100;
      }
    }
    return result;
  }

  private async fetchParsedEstimates(tenderIds: string[]): Promise<any[]> {
    if (tenderIds.length === 0) return [];

    try {
      return await prisma.prozorroEstimateData.findMany({
        where: {
          tenderId: { in: tenderIds },
          parseStatus: 'success',
        },
        include: { items: true },
        take: 20,
      });
    } catch {
      return [];
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private extractCity(tender: RawTender): string | undefined {
    const title = tender.title || '';
    // Спроба витягти місто з назви тендера
    const cityPatterns = [
      /м\.\s*([А-ЯІЇЄҐа-яіїєґ'-]+)/,
      /місто\s+([А-ЯІЇЄҐа-яіїєґ'-]+)/i,
      /([А-ЯІЇЄҐа-яіїєґ'-]+)\s+район/,
    ];

    for (const pattern of cityPatterns) {
      const match = title.match(pattern);
      if (match && match[1] && match[1].length > 2) {
        return match[1];
      }
    }

    // Fallback: procuringEntity address
    const locality = (tender.procuringEntity as any)?.address?.locality;
    if (locality) return locality;

    return undefined;
  }
}

/**
 * Singleton
 */
export const bidIntelligenceService = new BidIntelligenceService();
