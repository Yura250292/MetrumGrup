"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X, FileText, ExternalLink, TrendingUp, TrendingDown, Minus, Database } from "lucide-react";

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

interface EngineerReportModalProps {
  open: boolean;
  onClose: () => void;
  analysisSummary?: string | null;
  prozorroAnalysis?: ProzorroAnalysisData | string | null;
}

function parseProzorroData(data: any): ProzorroAnalysisData | null {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
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

export function EngineerReportModal({
  open,
  onClose,
  analysisSummary,
  prozorroAnalysis,
}: EngineerReportModalProps) {
  // 🆕 Блокуємо scroll body коли модалка відкрита
  // + закриття на Escape
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

  // SSR safety: portal лише на клієнті
  if (typeof document === 'undefined') return null;

  const prozorroData = parseProzorroData(prozorroAnalysis);
  const hasProzorro = !!prozorroData && prozorroData.similarProjectsFound > 0;
  const hasAnalysis = !!analysisSummary;

  // 🆕 Render через React Portal у document.body
  // Це гарантує що модалка не залежить від батьківського контейнера
  // і завжди з'являється поверх viewport (без скролу)
  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={(e) => {
        // Закриваємо при кліку на backdrop
        if (e.target === e.currentTarget) onClose();
      }}
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
                Аналіз проекту та конкурентних тендерів
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="analysis" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="analysis" className="gap-2">
                <FileText className="h-4 w-4" />
                Аналіз проекту
              </TabsTrigger>
              <TabsTrigger value="prozorro" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Prozorro {hasProzorro && (
                  <Badge variant="secondary" className="ml-1">
                    {prozorroData!.similarProjectsFound}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Аналіз проекту */}
            <TabsContent value="analysis" className="space-y-4">
              {hasAnalysis ? (
                <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
                  <h4 className="font-semibold text-base mb-3 text-primary flex items-center gap-2">
                    📋 Звіт інженера про аналіз проекту
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

            {/* TAB 2: Prozorro */}
            <TabsContent value="prozorro" className="space-y-4">
              {hasProzorro ? (
                <>
                  {/* Статистика */}
                  <div className="grid grid-cols-3 gap-3">
                    <Card className="p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Знайдено тендерів
                      </p>
                      <p className="text-2xl font-bold mt-1 text-blue-600">
                        {prozorroData!.similarProjectsFound}
                      </p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Розпарсено позицій
                      </p>
                      <p className="text-2xl font-bold mt-1 text-green-600">
                        {prozorroData!.totalItemsParsed}
                      </p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                        Рівень цін
                      </p>
                      <PriceLevelBadge level={prozorroData!.averagePriceLevel || 'medium'} />
                    </Card>
                  </div>

                  {/* 🆕 Згруповано за локацією — приблизний кошторис всіх дотичних робіт */}
                  {prozorroData!.aggregatedLocations && prozorroData!.aggregatedLocations.length > 0 && (
                    <Card className="p-5 border-purple-200 bg-gradient-to-br from-purple-50/50 to-transparent">
                      <h4 className="font-semibold text-base mb-1 flex items-center gap-2 text-purple-700">
                        📍 Сукупна вартість робіт за локацією
                      </h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Сума всіх тендерів навколо одного об'єкта в кожному місті —
                        приблизний бюджет дотичних робіт (підключення, благоустрій, тротуари тощо)
                      </p>
                      <div className="space-y-3">
                        {prozorroData!.aggregatedLocations.map((loc, idx) => (
                          <details key={idx} className="border rounded-lg group">
                            <summary className="p-3 cursor-pointer hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span className="text-2xl shrink-0">📍</span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-sm truncate">{loc.city}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {loc.tenderCount} тендер{loc.tenderCount === 1 ? '' : loc.tenderCount < 5 ? 'и' : 'ів'}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-base font-bold text-purple-700">
                                  {formatCurrency(loc.totalAmount)}
                                </p>
                                <p className="text-xs text-muted-foreground">сумарно</p>
                              </div>
                            </summary>
                            <div className="border-t bg-muted/20 p-3 space-y-2">
                              {loc.tenders.map((t, tIdx) => (
                                <div key={tIdx} className="flex items-start justify-between gap-3 text-xs py-2 border-b last:border-0">
                                  <div className="flex-1 min-w-0">
                                    <p className="line-clamp-2">{t.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-[10px] py-0">
                                        {t.status}
                                      </Badge>
                                      {t.tenderID && (
                                        <a
                                          href={`https://prozorro.gov.ua/tender/${t.tenderID}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                          <ExternalLink className="h-2.5 w-2.5" />
                                          {t.tenderID}
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                  <p className="font-medium text-foreground shrink-0">
                                    {formatCurrency(t.amount)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Топ схожих тендерів */}
                  {prozorroData!.topSimilarProjects && prozorroData!.topSimilarProjects.length > 0 && (
                    <Card className="p-5">
                      <h4 className="font-semibold text-base mb-4 flex items-center gap-2">
                        🔝 Топ схожих тендерів ({prozorroData!.topSimilarProjects.length})
                      </h4>
                      <div className="space-y-3">
                        {prozorroData!.topSimilarProjects.map((project, idx) => (
                          <div
                            key={idx}
                            className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <p className="text-sm font-medium flex-1 leading-snug">
                                {idx + 1}. {project.title}
                              </p>
                              <Badge variant="outline" className="shrink-0">
                                {Math.round(project.similarity)}% схожість
                              </Badge>
                            </div>
                            {project.procuringEntity && (
                              <p className="text-xs text-muted-foreground mb-2">
                                🏢 {project.procuringEntity}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                💰 <strong className="text-foreground">{formatCurrency(project.budget)}</strong>
                              </span>
                              {project.itemsCount > 0 && (
                                <span className="flex items-center gap-1">
                                  📋 <strong className="text-foreground">{project.itemsCount}</strong> позицій
                                </span>
                              )}
                              {project.datePublished && (
                                <span className="flex items-center gap-1">
                                  📅 {new Date(project.datePublished).toLocaleDateString('uk-UA')}
                                </span>
                              )}
                              {project.tenderID && (
                                <a
                                  href={`https://prozorro.gov.ua/tender/${project.tenderID}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Відкрити на Prozorro
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* База цін */}
                  {prozorroData!.priceDatabase && Object.keys(prozorroData!.priceDatabase).length > 0 && (
                    <Card className="p-5">
                      <h4 className="font-semibold text-base mb-4 flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        База середніх цін з Prozorro
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(prozorroData!.priceDatabase).map(([category, price]) => (
                          <div
                            key={category}
                            className="flex items-center justify-between text-sm border-b pb-2"
                          >
                            <span className="text-muted-foreground">{category}</span>
                            <span className="font-medium">{formatCurrency(Number(price))}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </>
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
