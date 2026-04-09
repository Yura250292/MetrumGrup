"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Search, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { WizardData } from '@/lib/wizard-types';

interface ProzorroTenderSearchProps {
  estimateId: string;
  wizardData?: WizardData;
  autoSearch?: boolean;
  onClose?: () => void;
}

interface TenderMatch {
  tender: {
    id: string;
    title: string;
    description: string;
    status: string;
    valueAmount: number;
    valueCurrency: string;
    procuringEntityName: string;
    cpvCode: string;
    cpvDescription: string;
    datePublished: string;
    awardedAmount: number | null;
  };
  similarityScore: number;
  matchReasons: string[];
  prozorroUrl: string;
}

interface SearchResponse {
  matches: TenderMatch[];
  searchParams: {
    budgetRange: [number, number];
    cpvCode: string;
    keywords: string[];
    area: number | null;
  };
  totalFound: number;
  cached: boolean;
}

export function ProzorroTenderSearch({
  estimateId,
  wizardData,
  autoSearch = false,
  onClose,
}: ProzorroTenderSearchProps) {
  const [loading, setLoading] = useState(autoSearch);
  const [matches, setMatches] = useState<TenderMatch[]>([]);
  const [searchParams, setSearchParams] = useState<SearchResponse['searchParams'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (autoSearch) {
      handleSearch();
    }
  }, [autoSearch]);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/estimates/prozorro/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId, wizardData }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Не вдалося знайти тендери');
      }

      const data: SearchResponse = await response.json();
      setMatches(data.matches);
      setSearchParams(data.searchParams);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Невідома помилка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Схожі тендери на Prozorro
        </CardTitle>
        <CardDescription>
          Конкурентні ціни для подібних проектів з публічних закупівель
        </CardDescription>
      </CardHeader>

      <CardContent>
        {!autoSearch && !loading && matches.length === 0 && (
          <Button onClick={handleSearch} className="w-full">
            <Search className="mr-2 h-4 w-4" />
            Пошук схожих тендерів
          </Button>
        )}

        {loading && <LoadingSkeleton />}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {searchParams && (
          <div className="mb-4 p-3 bg-muted rounded-lg text-sm">
            <p className="font-medium mb-1">Параметри пошуку:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>
                Бюджет: {formatCurrency(searchParams.budgetRange[0])} -{' '}
                {formatCurrency(searchParams.budgetRange[1])}
              </li>
              <li>Категорія: {searchParams.cpvCode}</li>
              {searchParams.area && <li>Площа: ~{searchParams.area} м²</li>}
              {searchParams.keywords.length > 0 && (
                <li>Ключові слова: {searchParams.keywords.slice(0, 5).join(', ')}</li>
              )}
            </ul>
          </div>
        )}

        {!loading && matches.length > 0 && (
          <div className="space-y-3">
            {matches.map(match => (
              <TenderCard key={match.tender.id} match={match} />
            ))}
          </div>
        )}

        {!loading && matches.length === 0 && searchParams && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Схожих тендерів не знайдено. Спробуйте змінити фільтри або перевірте пізніше.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function TenderCard({ match }: { match: TenderMatch }) {
  const { tender, similarityScore, matchReasons, prozorroUrl } = match;

  return (
    <div className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h4 className="font-medium line-clamp-2">{tender.title}</h4>
          <p className="text-sm text-muted-foreground mt-1">
            {tender.procuringEntityName}
          </p>
        </div>
        <Badge variant={similarityScore >= 80 ? 'default' : 'secondary'} className="ml-2">
          {similarityScore}% схожість
        </Badge>
      </div>

      {tender.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {tender.description}
        </p>
      )}

      <div className="flex gap-4 text-sm mb-3">
        <span className="font-semibold text-green-600">
          {formatCurrency(tender.awardedAmount || tender.valueAmount)}
        </span>
        <span className="text-muted-foreground">
          {new Date(tender.datePublished).toLocaleDateString('uk-UA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
        {tender.awardedAmount && (
          <Badge variant="outline" className="text-xs">
            Переможець
          </Badge>
        )}
      </div>

      {matchReasons.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {matchReasons.map((reason, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {reason}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{tender.cpvDescription || `CPV: ${tender.cpvCode}`}</span>
        <a
          href={prozorroUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline text-xs h-auto p-0 inline-flex items-center"
        >
          Відкрити на Prozorro <ExternalLink className="ml-1 h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="border rounded-lg p-4">
          <div className="flex justify-between mb-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-1/2 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
