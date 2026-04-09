"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  Download,
  AlertCircle,
  FileSpreadsheet,
  FileImage,
  File,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface TenderDocument {
  id: string;
  title: string;
  url: string;
  format: string;
  documentType: string;
  datePublished: string;
  dateModified: string;
}

interface ParsedItem {
  id: string;
  rowNumber: number;
  category?: string;
  code?: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
}

interface ParsedData {
  id: string;
  documentTitle: string;
  totalItems: number;
  totalAmount: number;
  parsedAt: string;
  items: ParsedItem[];
}

interface TenderDocumentsProps {
  tenderId: string;
  onDocumentSelect?: (document: TenderDocument) => void;
}

// Іконка за типом файлу
function getFileIcon(format: string) {
  if (format.includes('pdf')) return <FileText className="h-4 w-4" />;
  if (format.includes('spreadsheet') || format.includes('excel')) return <FileSpreadsheet className="h-4 w-4" />;
  if (format.includes('image')) return <FileImage className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

// Опис типу документа
function getDocumentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    billOfQuantity: '💰 Кошторис',
    technicalSpecifications: '📋 Технічні специфікації',
    illustration: '🖼️ Ілюстрація',
    eligibilityDocuments: '📄 Кваліфікаційні документи',
    contractProforma: '📑 Проект договору',
  };
  return labels[type] || type;
}

export function TenderDocuments({ tenderId, onDocumentSelect }: TenderDocumentsProps) {
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [categorized, setCategorized] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/prozorro/tenders/${tenderId}/documents`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Не вдалося завантажити документи');
      }

      const data = await response.json();
      setDocuments(data.documents);
      setCategorized(data.categorized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Невідома помилка');
    } finally {
      setLoading(false);
    }
  };

  const downloadDocument = async (doc: TenderDocument) => {
    setDownloadingId(doc.id);

    try {
      const response = await fetch('/api/prozorro/documents/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentUrl: doc.url,
          fileName: doc.title,
        }),
      });

      if (!response.ok) {
        throw new Error('Не вдалося завантажити файл');
      }

      // Створити blob і завантажити
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.title;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка завантаження');
    } finally {
      setDownloadingId(null);
    }
  };

  const parseDocument = async (doc: TenderDocument) => {
    setParsingId(doc.id);
    setParsedData(null);
    setError(null);

    try {
      const response = await fetch('/api/prozorro/documents/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId,
          documentId: doc.id,
          documentUrl: doc.url,
          documentTitle: doc.title,
          documentFormat: doc.format,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Не вдалося розпарсити документ');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Помилка парсингу');
      }

      setParsedData(result.data);
      console.log(`✅ Розпарсено ${result.data.totalItems} позицій`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка парсингу');
    } finally {
      setParsingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Документи тендера
        </CardTitle>
        <CardDescription>
          Кошториси та специфікації переможця з Prozorro
        </CardDescription>
      </CardHeader>

      <CardContent>
        {!loading && documents.length === 0 && (
          <Button onClick={fetchDocuments} className="w-full">
            <FileText className="mr-2 h-4 w-4" />
            Завантажити документи
          </Button>
        )}

        {loading && <LoadingSkeleton />}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && categorized && (
          <div className="space-y-4">
            {/* Кошториси */}
            {categorized.estimates.count > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  💰 Кошториси ({categorized.estimates.count})
                </h4>
                <div className="space-y-2">
                  {categorized.estimates.items.map((doc: TenderDocument) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      isDownloading={downloadingId === doc.id}
                      isParsing={parsingId === doc.id}
                      onDownload={() => downloadDocument(doc)}
                      onParse={() => parseDocument(doc)}
                      onSelect={() => onDocumentSelect?.(doc)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Специфікації */}
            {categorized.specifications.count > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  📋 Технічні специфікації ({categorized.specifications.count})
                </h4>
                <div className="space-y-2">
                  {categorized.specifications.items.map((doc: TenderDocument) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      isDownloading={downloadingId === doc.id}
                      onDownload={() => downloadDocument(doc)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Інші документи */}
            {categorized.other.count > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  📄 Інші документи ({categorized.other.count})
                </h4>
                <div className="space-y-2">
                  {categorized.other.items.map((doc: TenderDocument) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      isDownloading={downloadingId === doc.id}
                      onDownload={() => downloadDocument(doc)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && documents.length > 0 && categorized?.estimates.count === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              У цього тендера немає кошторисів у відкритому доступі
            </AlertDescription>
          </Alert>
        )}

        {/* Розпарсені дані */}
        {parsedData && (
          <div className="mt-6 pt-6 border-t">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-base font-semibold flex items-center gap-2">
                  ✅ Розпарсований кошторис
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {parsedData.documentTitle} • {parsedData.totalItems} позицій • {formatCurrency(parsedData.totalAmount)}
                </p>
              </div>
              <Badge variant="default">{parsedData.totalItems} позицій</Badge>
            </div>

            <div className="max-h-[500px] overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium">#</th>
                    <th className="p-2 text-left font-medium">Опис</th>
                    <th className="p-2 text-center font-medium">Од.</th>
                    <th className="p-2 text-right font-medium">Кільк.</th>
                    <th className="p-2 text-right font-medium">Ціна</th>
                    <th className="p-2 text-right font-medium">Сума</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.items.map((item, index) => (
                    <>
                      {item.category && (index === 0 || parsedData.items[index - 1]?.category !== item.category) && (
                        <tr key={`cat-${index}`} className="bg-blue-50 dark:bg-blue-950/20">
                          <td colSpan={6} className="p-2 font-semibold text-sm">
                            📂 {item.category}
                          </td>
                        </tr>
                      )}
                      <tr key={item.id} className="border-t hover:bg-accent/30">
                        <td className="p-2 text-muted-foreground">{item.rowNumber}</td>
                        <td className="p-2">
                          {item.code && <span className="text-xs text-muted-foreground mr-2">[{item.code}]</span>}
                          {item.description}
                        </td>
                        <td className="p-2 text-center">{item.unit}</td>
                        <td className="p-2 text-right">{item.quantity.toFixed(2)}</td>
                        <td className="p-2 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                      </tr>
                    </>
                  ))}
                  <tr className="border-t-2 bg-muted font-bold">
                    <td colSpan={5} className="p-2 text-right">РАЗОМ:</td>
                    <td className="p-2 text-right">{formatCurrency(parsedData.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentCard({
  document,
  isDownloading,
  isParsing,
  onDownload,
  onParse,
  onSelect,
}: {
  document: TenderDocument;
  isDownloading: boolean;
  isParsing?: boolean;
  onDownload: () => void;
  onParse?: () => void;
  onSelect?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-accent/30 rounded-lg border hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {getFileIcon(document.format)}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{document.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {getDocumentTypeLabel(document.documentType)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(document.datePublished).toLocaleDateString('uk-UA')}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onParse && document.documentType === 'billOfQuantity' && (
          <Button
            size="sm"
            variant="default"
            onClick={onParse}
            disabled={isDownloading || isParsing}
          >
            {isParsing ? (
              <>
                <span className="animate-spin mr-1">⏳</span>
                Парсинг...
              </>
            ) : (
              <>🤖 Розпарсити</>
            )}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onDownload}
          disabled={isDownloading || isParsing}
        >
          {isDownloading ? (
            <span className="animate-spin">⏳</span>
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 p-3 bg-accent/30 rounded-lg">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
