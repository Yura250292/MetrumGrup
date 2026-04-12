"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  X, FileText, ExternalLink, TrendingUp, TrendingDown, Minus, Database,
  Target, AlertTriangle, CheckCircle2, ChevronRight, Shield,
  DollarSign, BarChart3, ListChecks,
} from "lucide-react";
import type {
  StructuredEngineerReport,
  BidIntelligenceResult,
  BudgetBand,
  EnrichedTenderMatch,
  RiskWarning,
} from "@/lib/types/bid-intelligence";

// ============================================================
// LEGACY TYPES (backward compat)
// ============================================================

export interface ProzorroProjectInfo {
  title: string;
  budget: number;
  similarity: number;
  itemsCount: number;
  tenderID?: string;
  procuringEntity?: string;
  datePublished?: string;
  status?: string;
}

export interface AggregatedLocation {
  location: string;
  city: string;
  totalAmount: number;
  tenderCount: number;
  tenders: Array<{
    title: string;
    amount: number;
    tenderID?: string;
    status: string;
  }>;
}

export interface ProzorroAnalysisData {
  similarProjectsFound: number;
  totalItemsParsed: number;
  averagePriceLevel: 'low' | 'medium' | 'high';
  topSimilarProjects: ProzorroProjectInfo[];
  aggregatedLocations?: AggregatedLocation[];
  priceDatabase?: Record<string, number>;
}

// ============================================================
// PROPS
// ============================================================

interface EngineerReportModalProps {
  open: boolean;
  onClose: () => void;
  // Legacy
  analysisSummary?: string | null;
  prozorroAnalysis?: ProzorroAnalysisData | string | null;
  // New v2
  structuredReport?: StructuredEngineerReport | null;
  bidIntelligence?: BidIntelligenceResult | null;
}

// ============================================================
// HELPERS
// ============================================================

function parseProzorroData(data: any): ProzorroAnalysisData | null {
  if (!data) return null;
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return data;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 0,
  }).format(value);
}

function PriceLevelBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const config = {
    low: { icon: TrendingDown, text: 'Низькі ціни', color: 'bg-green-100 text-green-800 border-green-300' },
    medium: { icon: Minus, text: 'Середні ціни', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    high: { icon: TrendingUp, text: 'Високі ціни', color: 'bg-red-100 text-red-800 border-red-300' },
  };
  const { icon: Icon, text, color } = config[level] || config.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${color}`}>
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const config = {
    high: { text: 'Високий', color: 'bg-red-100 text-red-800 border-red-300' },
    medium: { text: 'Середній', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    low: { text: 'Низький', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  };
  const { text, color } = config[severity] || config.medium;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${color}`}>
      {text}
    </span>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function EngineerReportModal({
  open,
  onClose,
  analysisSummary,
  prozorroAnalysis,
  structuredReport,
  bidIntelligence,
}: EngineerReportModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const prozorroData = parseProzorroData(prozorroAnalysis);
  const hasProzorro = !!prozorroData && prozorroData.similarProjectsFound > 0;
  const hasAnalysis = !!analysisSummary;
  const hasStructured = !!structuredReport;
  const hasBidIntel = !!bidIntelligence && bidIntelligence.allMatches.length > 0;

  // Determine which tabs to show
  const showEntryPrice = hasBidIntel;
  const showEngineerPlan = hasStructured;

  // Count visible tabs
  const tabCount = 2 + (showEntryPrice ? 1 : 0) + (showEngineerPlan ? 1 : 0);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Звіт для інженера</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Аналіз проекту, ціна входу та план виконання
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className={`grid w-full mb-6 ${tabCount <= 2 ? 'grid-cols-2' : tabCount === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
              <TabsTrigger value="overview" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Огляд проекту
              </TabsTrigger>
              {showEntryPrice && (
                <TabsTrigger value="entry-price" className="gap-1.5 text-xs">
                  <Target className="h-3.5 w-3.5" />
                  Ціна входу
                </TabsTrigger>
              )}
              <TabsTrigger value="tenders" className="gap-1.5 text-xs">
                <ExternalLink className="h-3.5 w-3.5" />
                Тендери {hasProzorro && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    {hasBidIntel ? bidIntelligence!.allMatches.length : prozorroData!.similarProjectsFound}
                  </Badge>
                )}
              </TabsTrigger>
              {showEngineerPlan && (
                <TabsTrigger value="engineer-plan" className="gap-1.5 text-xs">
                  <ListChecks className="h-3.5 w-3.5" />
                  План інженера
                </TabsTrigger>
              )}
            </TabsList>

            {/* TAB 1: Огляд проекту */}
            <TabsContent value="overview" className="space-y-4">
              {hasStructured ? (
                <ProjectOverviewStructured report={structuredReport!} />
              ) : hasAnalysis ? (
                <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
                  <h4 className="font-semibold text-base mb-3 text-primary flex items-center gap-2">
                    Звіт інженера про аналіз проекту
                  </h4>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                      {analysisSummary}
                    </p>
                  </div>
                </Card>
              ) : (
                <Card className="p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Звіт інженера ще не згенеровано для цього кошторису.
                  </p>
                </Card>
              )}
            </TabsContent>

            {/* TAB 2: Ціна входу (new) */}
            {showEntryPrice && (
              <TabsContent value="entry-price" className="space-y-4">
                <EntryPriceTab bi={bidIntelligence!} />
              </TabsContent>
            )}

            {/* TAB 3: Схожі тендери */}
            <TabsContent value="tenders" className="space-y-4">
              {hasBidIntel ? (
                <TendersBidIntelligenceTab bi={bidIntelligence!} />
              ) : hasProzorro ? (
                <TendersLegacyTab data={prozorroData!} />
              ) : (
                <Card className="p-8 text-center">
                  <ExternalLink className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Аналіз Prozorro не доступний
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Не знайдено схожих тендерів або пошук не виконувався.
                  </p>
                </Card>
              )}
            </TabsContent>

            {/* TAB 4: План інженера (new) */}
            {showEngineerPlan && (
              <TabsContent value="engineer-plan" className="space-y-4">
                <EngineerPlanTab report={structuredReport!} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end">
          <Button onClick={onClose} variant="outline" type="button">
            Закрити
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  );
}

// ============================================================
// TAB: PROJECT OVERVIEW (Structured)
// ============================================================

function ProjectOverviewStructured({ report }: { report: StructuredEngineerReport }) {
  const pu = report.projectUnderstanding;
  return (
    <div className="space-y-4">
      {/* Project Understanding */}
      <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
        <h4 className="font-semibold text-base mb-3 text-primary">Розуміння проекту</h4>
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div><span className="text-muted-foreground">Тип:</span> <strong>{pu.objectType}</strong></div>
          {pu.area && <div><span className="text-muted-foreground">Площа:</span> <strong>{pu.area} м&sup2;</strong></div>}
          {pu.floors && <div><span className="text-muted-foreground">Поверхи:</span> <strong>{pu.floors}</strong></div>}
        </div>
        <p className="text-sm text-foreground/80">{pu.scope}</p>
        {Object.keys(pu.keyParameters).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(pu.keyParameters).map(([key, val]) => (
              <Badge key={key} variant="outline" className="text-xs">{key}: {val}</Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Assumptions */}
      {report.assumptions.length > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Припущення ({report.assumptions.length})
          </h4>
          <ul className="space-y-1.5 text-sm text-foreground/80">
            {report.assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Missing Inputs */}
      {report.missingInputs.length > 0 && (
        <Card className="p-5 border-orange-200 bg-gradient-to-br from-orange-50/50 to-transparent">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-orange-700">
            <AlertTriangle className="h-4 w-4" />
            Що потрібно уточнити ({report.missingInputs.length})
          </h4>
          <ul className="space-y-1.5 text-sm">
            {report.missingInputs.map((m, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-orange-500 shrink-0 mt-0.5">!</span>
                {m}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Documents Analyzed */}
      {pu.documentsAnalyzed.length > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Проаналізовані документи
          </h4>
          <div className="flex flex-wrap gap-2">
            {pu.documentsAnalyzed.map((d, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{d}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// TAB: ENTRY PRICE
// ============================================================

function EntryPriceTab({ bi }: { bi: BidIntelligenceResult }) {
  const ep = bi.entryPrice;
  const wa = bi.winnerAnalysis;
  const ms = bi.marketSignals;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 border-green-200 bg-gradient-to-br from-green-50/50 to-transparent">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Рекомендована ціна</p>
          <p className="text-lg font-bold text-green-700">
            {formatCurrency(ep.recommended.min)} &ndash; {formatCurrency(ep.recommended.max)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Оптимальний діапазон</p>
        </Card>
        <Card className="p-4 border-red-200 bg-gradient-to-br from-red-50/50 to-transparent">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Агресивна ціна</p>
          <p className="text-lg font-bold text-red-700">
            {formatCurrency(ep.aggressive.min)} &ndash; {formatCurrency(ep.aggressive.max)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Ризик демпінгу</p>
        </Card>
        <Card className="p-4 border-blue-200 bg-gradient-to-br from-blue-50/50 to-transparent">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Безпечна ціна</p>
          <p className="text-lg font-bold text-blue-700">
            {formatCurrency(ep.conservative.min)} &ndash; {formatCurrency(ep.conservative.max)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Захист маржі</p>
        </Card>
      </div>

      {/* Winner Analysis */}
      {wa.sampleSize > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Аналіз цін переможців ({wa.sampleSize} тендерів)
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Медіана ціни переможця</p>
              <p className="font-bold text-lg">{formatCurrency(wa.medianWinnerPrice)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Середня знижка від очікуваної</p>
              <p className="font-bold text-lg text-green-600">-{wa.avgDiscount}%</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Коридор виграшу</p>
              <p className="font-medium">{formatCurrency(wa.winCorridor.low)} &ndash; {formatCurrency(wa.winCorridor.high)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Діапазон знижок</p>
              <p className="font-medium">{wa.minDiscount}% &ndash; {wa.maxDiscount}%</p>
            </div>
          </div>
        </Card>
      )}

      {/* Market Signals */}
      <Card className="p-5">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Ринкові сигнали
        </h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-1">Конкуренція</p>
            <Badge variant={ms.competitionLevel === 'high' ? 'destructive' : ms.competitionLevel === 'low' ? 'default' : 'secondary'}>
              {ms.competitionLevel === 'high' ? 'Висока' : ms.competitionLevel === 'low' ? 'Низька' : 'Середня'}
            </Badge>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-1">Тренд цін</p>
            <Badge variant="outline">
              {ms.trendDirection === 'rising' ? 'Зростання' : ms.trendDirection === 'falling' ? 'Падіння' : 'Стабільно'}
            </Badge>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-1">Регіон</p>
            <p className="text-xs">{ms.regionFactor}</p>
          </div>
        </div>
      </Card>

      {/* Basis */}
      <p className="text-xs text-muted-foreground italic">{ep.basis}</p>
    </div>
  );
}

// ============================================================
// TAB: TENDERS (BidIntelligence version)
// ============================================================

function TendersBidIntelligenceTab({ bi }: { bi: BidIntelligenceResult }) {
  const bandLabels: Record<string, string> = {
    core: 'Ядро (±10%)',
    near: 'Розширені (±20%)',
    context: 'Контекст (±30%)',
  };
  const bandColors: Record<string, string> = {
    core: 'border-green-200 bg-gradient-to-br from-green-50/30 to-transparent',
    near: 'border-blue-200 bg-gradient-to-br from-blue-50/30 to-transparent',
    context: 'border-gray-200',
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Всього знайдено</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">{bi.searchMeta.totalFound}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Цільовий бюджет</p>
          <p className="text-lg font-bold mt-1">{formatCurrency(bi.targetBudget)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">В межах ±10%</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{bi.budgetBands[0]?.tenders.length || 0}</p>
        </Card>
      </div>

      {/* Budget Bands */}
      {bi.budgetBands.map(band => (
        band.tenders.length > 0 && (
          <Card key={band.label} className={`p-5 ${bandColors[band.label] || ''}`}>
            <h4 className="font-semibold text-sm mb-3 flex items-center justify-between">
              <span>{bandLabels[band.label] || band.label}</span>
              <Badge variant="secondary">{band.tenders.length} тендерів</Badge>
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Діапазон: {formatCurrency(band.range.min)} &ndash; {formatCurrency(band.range.max)}
            </p>
            <div className="space-y-2">
              {band.tenders.slice(0, 5).map((t, i) => (
                <TenderMatchCard key={t.tenderID || i} tender={t} index={i} />
              ))}
              {band.tenders.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + ще {band.tenders.length - 5} тендерів
                </p>
              )}
            </div>
          </Card>
        )
      ))}

      {/* Aggregated Locations */}
      {bi.aggregatedLocations.length > 0 && (
        <Card className="p-5 border-purple-200 bg-gradient-to-br from-purple-50/50 to-transparent">
          <h4 className="font-semibold text-base mb-1 flex items-center gap-2 text-purple-700">
            Сукупна вартість за локацією
          </h4>
          <div className="space-y-3 mt-3">
            {bi.aggregatedLocations.map((loc, idx) => (
              <details key={idx} className="border rounded-lg group">
                <summary className="p-3 cursor-pointer hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{loc.city}</p>
                      <p className="text-xs text-muted-foreground">{loc.tenderCount} тендерів</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-purple-700">{formatCurrency(loc.totalAmount)}</p>
                  </div>
                </summary>
                <div className="border-t bg-muted/20 p-3 space-y-2">
                  {loc.tenders.map((t, tIdx) => (
                    <div key={tIdx} className="flex items-start justify-between gap-3 text-xs py-2 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="line-clamp-2">{t.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] py-0">{t.status}</Badge>
                          {t.tenderID && (
                            <a href={`https://prozorro.gov.ua/tender/${t.tenderID}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1">
                              <ExternalLink className="h-2.5 w-2.5" />{t.tenderID}
                            </a>
                          )}
                        </div>
                      </div>
                      <p className="font-medium text-foreground shrink-0">{formatCurrency(t.amount)}</p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Card>
      )}

      {/* Price Database */}
      {Object.keys(bi.priceDatabase).length > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-base mb-4 flex items-center gap-2">
            <Database className="h-4 w-4" />
            База середніх цін з Prozorro
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(bi.priceDatabase).map(([category, price]) => (
              <div key={category} className="flex items-center justify-between text-sm border-b pb-2">
                <span className="text-muted-foreground">{category}</span>
                <span className="font-medium">{formatCurrency(Number(price))}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function TenderMatchCard({ tender, index }: { tender: EnrichedTenderMatch; index: number }) {
  return (
    <div className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className="text-sm font-medium flex-1 leading-snug line-clamp-2">
          {index + 1}. {tender.title}
        </p>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {tender.similarityScore}%
        </Badge>
      </div>
      {tender.procuringEntity && (
        <p className="text-xs text-muted-foreground mb-1.5">{tender.procuringEntity}</p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium text-foreground">{formatCurrency(tender.budget)}</span>
        {tender.awardedAmount && (
          <span className="text-green-600 font-medium">
            Переможець: {formatCurrency(tender.awardedAmount)}
            {tender.discount && ` (${tender.discount > 0 ? '+' : ''}${tender.discount}%)`}
          </span>
        )}
        {tender.datePublished && (
          <span>{new Date(tender.datePublished).toLocaleDateString('uk-UA')}</span>
        )}
        {tender.tenderID && (
          <a href={`https://prozorro.gov.ua/tender/${tender.tenderID}`} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Prozorro
          </a>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TAB: TENDERS (Legacy version)
// ============================================================

function TendersLegacyTab({ data }: { data: ProzorroAnalysisData }) {
  return (
    <>
      {/* Статистика */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Знайдено тендерів</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">{data.similarProjectsFound}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Розпарсено позицій</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{data.totalItemsParsed}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Рівень цін</p>
          <PriceLevelBadge level={data.averagePriceLevel || 'medium'} />
        </Card>
      </div>

      {/* Aggregated Locations */}
      {data.aggregatedLocations && data.aggregatedLocations.length > 0 && (
        <Card className="p-5 border-purple-200 bg-gradient-to-br from-purple-50/50 to-transparent">
          <h4 className="font-semibold text-base mb-1 flex items-center gap-2 text-purple-700">
            Сукупна вартість робіт за локацією
          </h4>
          <div className="space-y-3 mt-3">
            {data.aggregatedLocations.map((loc, idx) => (
              <details key={idx} className="border rounded-lg group">
                <summary className="p-3 cursor-pointer hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{loc.city}</p>
                      <p className="text-xs text-muted-foreground">{loc.tenderCount} тендерів</p>
                    </div>
                  </div>
                  <p className="text-base font-bold text-purple-700 shrink-0">{formatCurrency(loc.totalAmount)}</p>
                </summary>
                <div className="border-t bg-muted/20 p-3 space-y-2">
                  {loc.tenders.map((t, tIdx) => (
                    <div key={tIdx} className="flex items-start justify-between gap-3 text-xs py-2 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="line-clamp-2">{t.title}</p>
                        {t.tenderID && (
                          <a href={`https://prozorro.gov.ua/tender/${t.tenderID}`} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1 mt-1">
                            <ExternalLink className="h-2.5 w-2.5" />{t.tenderID}
                          </a>
                        )}
                      </div>
                      <p className="font-medium text-foreground shrink-0">{formatCurrency(t.amount)}</p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Card>
      )}

      {/* Top Similar Tenders */}
      {data.topSimilarProjects && data.topSimilarProjects.length > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-base mb-4">Топ схожих тендерів ({data.topSimilarProjects.length})</h4>
          <div className="space-y-3">
            {data.topSimilarProjects.map((project, idx) => (
              <div key={idx} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-medium flex-1 leading-snug">{idx + 1}. {project.title}</p>
                  <Badge variant="outline" className="shrink-0">{Math.round(project.similarity)}%</Badge>
                </div>
                {project.procuringEntity && (
                  <p className="text-xs text-muted-foreground mb-2">{project.procuringEntity}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span><strong className="text-foreground">{formatCurrency(project.budget)}</strong></span>
                  {project.itemsCount > 0 && <span><strong className="text-foreground">{project.itemsCount}</strong> позицій</span>}
                  {project.datePublished && <span>{new Date(project.datePublished).toLocaleDateString('uk-UA')}</span>}
                  {project.tenderID && (
                    <a href={`https://prozorro.gov.ua/tender/${project.tenderID}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:underline">
                      <ExternalLink className="h-3 w-3" /> Prozorro
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Price Database */}
      {data.priceDatabase && Object.keys(data.priceDatabase).length > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-base mb-4 flex items-center gap-2">
            <Database className="h-4 w-4" />
            База середніх цін з Prozorro
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.priceDatabase).map(([category, price]) => (
              <div key={category} className="flex items-center justify-between text-sm border-b pb-2">
                <span className="text-muted-foreground">{category}</span>
                <span className="font-medium">{formatCurrency(Number(price))}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

// ============================================================
// TAB: ENGINEER PLAN (Structured)
// ============================================================

function EngineerPlanTab({ report }: { report: StructuredEngineerReport }) {
  return (
    <div className="space-y-4">
      {/* Execution Sequence */}
      {report.executionSequence.length > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-base mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Рекомендована послідовність робіт
          </h4>
          <div className="space-y-3">
            {report.executionSequence.map((stage) => (
              <details key={stage.order} className="border rounded-lg group">
                <summary className="p-3 cursor-pointer hover:bg-muted/30 transition-colors flex items-center gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                    {stage.order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{stage.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{stage.goal}</p>
                  </div>
                  {stage.estimatedDuration && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">{stage.estimatedDuration}</Badge>
                  )}
                </summary>
                <div className="border-t bg-muted/10 p-4 space-y-3 text-sm">
                  {stage.prerequisites.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Передумови:</p>
                      <ul className="space-y-0.5">
                        {stage.prerequisites.map((p, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 shrink-0" />{p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {stage.risks.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Ризики:</p>
                      <ul className="space-y-0.5">
                        {stage.risks.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <AlertTriangle className="h-3 w-3 mt-0.5 text-yellow-500 shrink-0" />{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {stage.controlPoints.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Контрольні точки:</p>
                      <ul className="space-y-0.5">
                        {stage.controlPoints.map((cp, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <Target className="h-3 w-3 mt-0.5 text-blue-500 shrink-0" />{cp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Card>
      )}

      {/* Pre-Start Checklist */}
      {report.preStartChecklist.length > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Чеклист до старту ({report.preStartChecklist.length})
          </h4>
          <div className="space-y-1.5">
            {report.preStartChecklist.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm py-1">
                <div className={`w-4 h-4 rounded border-2 shrink-0 ${item.critical ? 'border-red-400' : 'border-gray-300'}`} />
                <span className={item.critical ? 'font-medium' : ''}>{item.item}</span>
                {item.critical && <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Критично</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Risk Warnings */}
      {report.riskWarnings.length > 0 && (
        <Card className="p-5 border-red-200 bg-gradient-to-br from-red-50/30 to-transparent">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-red-700">
            <Shield className="h-4 w-4" />
            Ризики проекту ({report.riskWarnings.length})
          </h4>
          <div className="space-y-3">
            {report.riskWarnings.map((risk, i) => (
              <div key={i} className="border rounded-lg p-3 bg-white/50">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={risk.severity} />
                  <span className="text-sm font-medium">{risk.area}</span>
                </div>
                <p className="text-xs text-foreground/80 mb-1">{risk.description}</p>
                <p className="text-xs text-green-700">Мітигація: {risk.mitigation}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Critical Dependencies */}
      {report.criticalDependencies.length > 0 && (
        <Card className="p-5">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Критичні залежності
          </h4>
          <ul className="space-y-1.5 text-sm">
            {report.criticalDependencies.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />{d}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
