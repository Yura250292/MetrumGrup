"use client";

import { useState, useEffect, use } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Send, CheckCircle, XCircle, Calculator, Loader2, DollarSign, Percent, Truck, X, FileDown, FileSpreadsheet, Mail, Plus, Upload, FileText, Image as ImageIcon, AlertCircle, Info, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { TaxBreakdownCard } from "@/components/admin/TaxBreakdownCard";
import { EstimateHistoryTimeline } from "@/components/admin/EstimateHistoryTimeline";
import { ApprovalSignatureCard } from "@/components/admin/ApprovalSignatureCard";
import { EngineerReportModal } from "@/components/admin/EngineerReportModal";
import { OpenEstimateChatButton } from "@/components/chat/OpenEstimateChatButton";
import { CommentThread } from "@/components/collab/CommentThread";
import { EditableSectionTable } from "@/components/estimates/EditableSectionTable";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  REVISION: "bg-yellow-100 text-yellow-700",
  ENGINEER_REVIEW: "bg-purple-100 text-purple-700",
  FINANCE_REVIEW: "bg-orange-100 text-orange-700",
};

type EstimateItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  laborRate: number;
  laborHours: number;
  amount: number;
  useCustomMargin: boolean;
  customMarginPercent: number | null;
  material: { name: string; sku: string } | null;
};

type EstimateSection = {
  id: string;
  title: string;
  items: EstimateItem[];
};

type Estimate = {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  totalMaterials: number;
  totalLabor: number;
  totalOverhead: number;
  totalAmount: number;
  discount: number;
  finalAmount: number;
  notes: string | null;
  analysisSummary: string | null;
  prozorroAnalysis: string | null;
  profitMarginMaterials: number | null;
  profitMarginLabor: number | null;
  profitMarginOverall: number;
  profitAmount: number;
  taxationType: string | null;
  taxRate: number;
  taxAmount: number;
  finalClientPrice: number;
  logisticsCost: number;
  createdAt: string;
  project: { title: string; client: { name: string } };
  createdBy: { name: string };
  sections: EstimateSection[];
  // Детальний розподіл податків
  pdvAmount?: number;
  esvAmount?: number;
  militaryTaxAmount?: number;
  profitTaxAmount?: number;
  unifiedTaxAmount?: number;
  pdfoAmount?: number;
  taxCalculationDetails?: {
    totalTaxAmount: number;
    netProfit: number;
    effectiveTaxRate: number;
  };
};

export default function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [updating, setUpdating] = useState(false);
  const [financeModalOpen, setFinanceModalOpen] = useState(false);
  const [engineerReportOpen, setEngineerReportOpen] = useState(false);
  const [applyingFinance, setApplyingFinance] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'discussion'>('details');
  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [supplementInfo, setSupplementInfo] = useState("");
  const [supplementFiles, setSupplementFiles] = useState<File[]>([]);
  const [supplementing, setSupplementing] = useState(false);
  const [supplementProgress, setSupplementProgress] = useState<{ message: string; progress: number } | null>(null);
  const [supplementError, setSupplementError] = useState("");
  const [approvals, setApprovals] = useState<any[]>([]);

  // Financial form state
  const [globalMargin, setGlobalMargin] = useState(20);
  const [logisticsCost, setLogisticsCost] = useState(0);
  const [taxationType, setTaxationType] = useState<"CASH" | "FOP" | "VAT">("CASH");
  const [financeNotes, setFinanceNotes] = useState("");
  const [itemMargins, setItemMargins] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`/api/admin/estimates/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setEstimate(data);
        // Initialize item margins from existing data
        const margins: Record<string, number> = {};
        data.sections?.forEach((section: EstimateSection) => {
          section.items.forEach((item) => {
            if (item.useCustomMargin && item.customMarginPercent) {
              margins[item.id] = item.customMarginPercent;
            } else {
              margins[item.id] = 20; // Default
            }
          });
        });
        setItemMargins(margins);
        setLogisticsCost(data.logisticsCost || 0);
      });
  }, [id]);

  // Load approvals when history tab is active
  useEffect(() => {
    if (activeTab === 'history') {
      fetch(`/api/admin/estimates/${id}/history`)
        .then((r) => r.json())
        .then((data) => {
          if (data.approvals) {
            setApprovals(data.approvals);
          }
        })
        .catch((err) => console.error('Failed to load approvals:', err));
    }
  }, [id, activeTab]);

  async function updateStatus(status: string) {
    setUpdating(true);
    try {
      await fetch(`/api/admin/estimates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setEstimate((prev) => (prev ? { ...prev, status } : prev));
    } finally {
      setUpdating(false);
    }
  }

  function applyGlobalMargin() {
    const newMargins = { ...itemMargins };
    estimate?.sections.forEach((section) => {
      section.items.forEach((item) => {
        newMargins[item.id] = globalMargin;
      });
    });
    setItemMargins(newMargins);
  }

  function updateItemMargin(itemId: string, value: number) {
    setItemMargins((prev) => ({ ...prev, [itemId]: value }));
  }

  async function applyFinancialSettings() {
    if (!estimate) return;

    setApplyingFinance(true);
    try {
      const body = {
        itemMargins: Object.entries(itemMargins).map(([itemId, marginPercent]) => ({
          itemId,
          marginPercent,
        })),
        logisticsCost,
        taxationType,
        financeNotes,
      };

      const res = await fetch(`/api/admin/estimates/${id}/finance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        // Reload estimate
        const estimateRes = await fetch(`/api/admin/estimates/${id}`);
        const estimateData = await estimateRes.json();
        setEstimate(estimateData.data);
        setFinanceModalOpen(false);
        alert("Фінансові налаштування успішно застосовано!");
      } else {
        const error = await res.json();
        alert(error.error || "Помилка застосування фінансових налаштувань");
      }
    } catch (error) {
      console.error("Error applying financial settings:", error);
      alert("Помилка застосування фінансових налаштувань");
    } finally {
      setApplyingFinance(false);
    }
  }

  // Calculate preview
  const calculatePreview = () => {
    if (!estimate) return null;

    let totalWithMargins = 0;

    // Calculate each item with its margin
    estimate.sections.forEach((section) => {
      section.items.forEach((item) => {
        const margin = itemMargins[item.id] || 0;
        const itemWithMargin = item.amount * (1 + margin / 100);
        totalWithMargins += itemWithMargin;
      });
    });

    // Add logistics
    const totalWithLogistics = totalWithMargins + logisticsCost;

    // Calculate tax
    let taxRate = 0;
    if (taxationType === "FOP") taxRate = 5; // ВИПРАВЛЕНО: було 6%, правильно 5%
    if (taxationType === "VAT") taxRate = 20;

    const taxAmount = totalWithLogistics * (taxRate / 100);
    const finalPrice = totalWithLogistics + taxAmount;

    return {
      baseTotal: estimate.totalAmount,
      totalWithMargins,
      profitAmount: totalWithMargins - estimate.totalAmount,
      logisticsCost,
      totalWithLogistics,
      taxRate,
      taxAmount,
      finalPrice,
    };
  };

  const preview = calculatePreview();

  // Експорт кошторису
  async function exportEstimate(format: "pdf" | "excel") {
    setExporting(format);
    try {
      const response = await fetch(`/api/estimates/${id}/export?format=${format}`);
      if (!response.ok) throw new Error("Failed to export");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Кошторис_${estimate?.number}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert("Помилка експорту кошторису");
    } finally {
      setExporting(null);
    }
  }

  // Експорт і відправка клієнту
  async function sendToClient() {
    if (!confirm(`Надіслати кошторис ${estimate?.number} клієнту ${estimate?.project.client.name}?`)) {
      return;
    }

    setSendingToClient(true);
    try {
      const response = await fetch(`/api/estimates/${id}/export?format=pdf&sendToClient=true`);
      if (!response.ok) throw new Error("Failed to send");

      const data = await response.json();
      alert(data.message || "Кошторис успішно надіслано клієнту!");
    } catch (error) {
      console.error("Send error:", error);
      alert("Помилка відправки кошторису клієнту");
    } finally {
      setSendingToClient(false);
    }
  }

  // Supplement estimate with additional files/data
  async function supplementEstimate() {
    if (!supplementInfo.trim() && supplementFiles.length === 0) {
      setSupplementError("Додайте текст або файли для доповнення кошторису");
      return;
    }

    setSupplementing(true);
    setSupplementError("");
    setSupplementProgress(null);

    try {
      const formData = new FormData();
      formData.append("additionalInfo", supplementInfo);

      // Upload files to R2 if any
      let r2Keys: any[] = [];
      if (supplementFiles.length > 0) {
        const uploadFormData = new FormData();
        supplementFiles.forEach(file => {
          uploadFormData.append("files", file);
        });

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadFormData,
        });

        if (!uploadRes.ok) {
          throw new Error("Не вдалось завантажити файли");
        }

        const uploadData = await uploadRes.json();
        r2Keys = uploadData.r2Keys || [];
      }

      formData.append("r2Keys", JSON.stringify(r2Keys));
      formData.append("regenerateAll", "true");

      // Call refine API
      const response = await fetch(`/api/admin/estimates/${id}/refine`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Помилка доповнення кошторису");
      }

      // Stream progress
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                setSupplementProgress({
                  message: data.message,
                  progress: data.progress || 0
                });

                if (data.status === 'complete' && data.data) {
                  // Success
                  alert(`✅ Кошторис успішно доповнено!\n\nСтара вартість: ${formatCurrency(data.data.oldTotalAmount)}\nНова вартість: ${formatCurrency(data.data.newTotalAmount)}\nЗміна: ${formatCurrency(data.data.difference)}`);

                  // Redirect to new estimate
                  window.location.href = `/admin/estimates/${data.data.newEstimateId}`;
                  return;
                } else if (data.status === 'error') {
                  throw new Error(data.message);
                }
              } catch (e) {
                console.error('Error parsing SSE:', e);
              }
            }
          }
        }
      }
    } catch (err) {
      setSupplementError(err instanceof Error ? err.message : "Не вдалось доповнити кошторис");
    } finally {
      setSupplementing(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  if (!estimate) return <div className="p-8 text-muted-foreground">Завантаження...</div>;

  return (
    <div>
      <Link
        href="/admin/estimates"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{estimate.title}</h1>
            <Badge className={STATUS_COLORS[estimate.status]}>
              {ESTIMATE_STATUS_LABELS[estimate.status as keyof typeof ESTIMATE_STATUS_LABELS]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {estimate.number} • {estimate.project.title} • {estimate.project.client.name} •{" "}
            {formatDate(estimate.createdAt)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Export buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportEstimate("pdf")}
            disabled={exporting === "pdf"}
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportEstimate("excel")}
            disabled={exporting === "excel"}
          >
            {exporting === "excel" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Excel
          </Button>

          {/* Supplement estimate button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSupplementModalOpen(true)}
            className="border-orange-500/30 text-orange-600 hover:bg-orange-50"
          >
            <Plus className="h-4 w-4" />
            Доповнити кошторис
          </Button>

          {/* Send to client button - only for approved estimates */}
          {estimate.status === "APPROVED" && (
            <Button
              size="sm"
              onClick={sendToClient}
              disabled={sendingToClient}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sendingToClient ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Надіслати клієнту
            </Button>
          )}

          {/* Financial settings button */}
          {(session?.user?.role === "FINANCIER" || session?.user?.role === "SUPER_ADMIN") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFinanceModalOpen(true)}
              className="bg-green-50 border-green-200 hover:bg-green-100 text-green-700"
            >
              <Calculator className="h-4 w-4" />
              Налаштувати фінанси
            </Button>
          )}
          {estimate.status === "DRAFT" && (
            <Button
              variant="outline"
              size="sm"
              disabled={updating}
              onClick={() => updateStatus("SENT")}
            >
              <Send className="h-4 w-4" />
              Надіслати клієнту
            </Button>
          )}
          <OpenEstimateChatButton estimateId={estimate.id} />
        </div>
      </div>

      {/* Tabs for Details, History and Discussion */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'details' | 'history' | 'discussion')} className="mt-6">
        <TabsList className="mb-6">
          <TabsTrigger value="details">Деталі кошторису</TabsTrigger>
          <TabsTrigger value="history">Історія та підписи</TabsTrigger>
          <TabsTrigger value="discussion">Обговорення</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          {/* Кнопка "Звіт для інженера" - відкриває модалку з табами */}
          {(estimate.analysisSummary || estimate.prozorroAnalysis) && (
            <Card className="p-4 border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 mb-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/20 p-2">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base text-primary">Звіт для інженера</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Аналіз проекту та конкурентні тендери Prozorro
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEngineerReportOpen(true);
                  }}
                  variant="default"
                  size="sm"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Відкрити звіт
                </Button>
              </div>
            </Card>
          )}

          <EngineerReportModal
            open={engineerReportOpen}
            onClose={() => setEngineerReportOpen(false)}
            analysisSummary={estimate.analysisSummary}
            prozorroAnalysis={estimate.prozorroAnalysis}
            structuredReport={(estimate as any).structuredReport}
            bidIntelligence={(estimate as any).bidIntelligence}
          />

          {/* Sections with editable items */}
          {estimate.sections.map((section) => (
            <div key={section.id} className="mb-4">
              <EditableSectionTable
                estimateId={estimate.id}
                sectionId={section.id}
                sectionTitle={section.title}
                items={section.items.map((item) => ({
                  id: item.id,
                  description: item.description,
                  unit: item.unit,
                  quantity: Number(item.quantity),
                  unitPrice: Number(item.unitPrice),
                  amount: Number(item.amount),
                }))}
                onChanged={() => {
                  fetch(`/api/admin/estimates/${id}`)
                    .then((r) => r.json())
                    .then(({ data }) => setEstimate(data))
                    .catch(console.error);
                }}
              />
            </div>
          ))}

      {/* Tax Breakdown */}
      {estimate.taxationType && estimate.taxationType !== "CASH" && estimate.taxCalculationDetails && (
        <TaxBreakdownCard
          taxationType={estimate.taxationType as "VAT" | "FOP"}
          taxBreakdown={{
            pdvAmount: Number(estimate.pdvAmount || 0),
            esvAmount: Number(estimate.esvAmount || 0),
            militaryTaxAmount: Number(estimate.militaryTaxAmount || 0),
            profitTaxAmount: Number(estimate.profitTaxAmount || 0),
            unifiedTaxAmount: Number(estimate.unifiedTaxAmount || 0),
            pdfoAmount: Number(estimate.pdfoAmount || 0),
            totalTaxAmount: estimate.taxCalculationDetails.totalTaxAmount,
            netProfit: estimate.taxCalculationDetails.netProfit,
            effectiveTaxRate: estimate.taxCalculationDetails.effectiveTaxRate,
          }}
          totalMargin={Number(estimate.profitAmount)}
          className="mb-4"
        />
      )}

      {/* Totals */}
      <Card className="p-5">
        <div className="space-y-2 text-sm max-w-sm ml-auto">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Матеріали</span>
            <span>{formatCurrency(Number(estimate.totalMaterials))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Роботи</span>
            <span>{formatCurrency(Number(estimate.totalLabor))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Накладні витрати</span>
            <span>{formatCurrency(Number(estimate.totalOverhead))}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium">Сира вартість</span>
            <span className="font-medium">{formatCurrency(Number(estimate.totalAmount))}</span>
          </div>

          {/* Financial calculations */}
          {estimate.profitAmount > 0 && (
            <>
              <div className="flex justify-between text-green-600">
                <span>Рентабельність</span>
                <span>+{formatCurrency(Number(estimate.profitAmount))}</span>
              </div>
            </>
          )}

          {estimate.logisticsCost > 0 && (
            <div className="flex justify-between text-blue-600">
              <span>Логістика</span>
              <span>+{formatCurrency(Number(estimate.logisticsCost))}</span>
            </div>
          )}

          {estimate.taxAmount > 0 && (
            <>
              <div className="flex justify-between text-orange-600">
                <span>
                  Податок ({estimate.taxationType === "FOP" ? "ФОП" : estimate.taxationType === "VAT" ? "ПДВ" : ""} {Number(estimate.taxRate)}%)
                </span>
                <span>+{formatCurrency(Number(estimate.taxAmount))}</span>
              </div>
            </>
          )}

          {estimate.finalClientPrice > 0 && (
            <div className="flex justify-between border-t pt-2 text-lg font-bold bg-green-50 -mx-5 px-5 py-3 mt-3">
              <span className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                Ціна для клієнта
              </span>
              <span className="text-green-600">{formatCurrency(Number(estimate.finalClientPrice))}</span>
            </div>
          )}

          {estimate.finalClientPrice === 0 && (
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>До сплати</span>
              <span className="text-primary">{formatCurrency(Number(estimate.finalAmount))}</span>
            </div>
          )}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">Цифрові підписи</h3>
            <ApprovalSignatureCard approvals={approvals} estimateId={estimate.id} />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Історія змін</h3>
            <EstimateHistoryTimeline estimateId={estimate.id} />
          </div>
        </TabsContent>

        <TabsContent value="discussion" className="space-y-4">
          <CommentThread entityType="ESTIMATE" entityId={estimate.id} />
        </TabsContent>
      </Tabs>

      {/* Finance Modal */}
      {financeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between sticky top-0 bg-white z-10 pb-4 border-b">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-green-600" />
                    Налаштування фінансів
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Встановіть рентабельність для кожної позиції
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFinanceModalOpen(false)}
                  disabled={applyingFinance}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Global margin controls */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Загальна рентабельність
                  </label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={globalMargin}
                      onChange={(e) => setGlobalMargin(Number(e.target.value))}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      value={globalMargin}
                      onChange={(e) => setGlobalMargin(Number(e.target.value))}
                      className="w-20 rounded border px-2 py-1 text-sm text-right"
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={applyGlobalMargin}
                    variant="outline"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white border-blue-700"
                  >
                    Застосувати до всіх позицій
                  </Button>
                </div>
              </div>

              {/* Items list with individual margins */}
              <div className="space-y-4">
                <h4 className="font-medium">Індивідуальна рентабельність по позиціях:</h4>
                {estimate.sections.map((section) => (
                  <div key={section.id} className="space-y-2">
                    <div className="text-sm font-medium text-primary bg-primary/10 px-3 py-1.5 rounded">
                      {section.title}
                    </div>
                    {section.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.amount)} • {item.quantity} {item.unit}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={itemMargins[item.id] || 0}
                            onChange={(e) => updateItemMargin(item.id, Number(e.target.value))}
                            className="w-20 rounded border px-2 py-1 text-sm text-right"
                            min="0"
                            max="200"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                          <span className="text-sm font-medium text-green-600 w-24 text-right">
                            +{formatCurrency(item.amount * (itemMargins[item.id] || 0) / 100)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Logistics cost */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Вартість логістики
                </label>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="number"
                    value={logisticsCost}
                    onChange={(e) => setLogisticsCost(Number(e.target.value))}
                    className="w-full rounded border px-3 py-2 text-sm"
                    min="0"
                    step="100"
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">₴</span>
                </div>
              </div>

              {/* Tax type */}
              <div>
                <label className="text-sm font-medium">Тип оподаткування</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button
                    onClick={() => setTaxationType("CASH")}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      taxationType === "CASH"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-border hover:border-green-200"
                    }`}
                  >
                    💵 Готівка
                    <div className="text-xs text-muted-foreground mt-1">Без податків</div>
                  </button>
                  <button
                    onClick={() => setTaxationType("FOP")}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      taxationType === "FOP"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-border hover:border-blue-200"
                    }`}
                  >
                    👤 ФОП
                    <div className="text-xs text-muted-foreground mt-1">3-я група, 5%</div>
                  </button>
                  <button
                    onClick={() => setTaxationType("VAT")}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      taxationType === "VAT"
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-border hover:border-orange-200"
                    }`}
                  >
                    🏢 ПДВ (ТОВ)
                    <div className="text-xs text-muted-foreground mt-1">20%</div>
                  </button>
                </div>
              </div>

              {/* Preview */}
              {preview && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-green-900">Попередній розрахунок:</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Сира вартість:</span>
                      <span className="font-medium">{formatCurrency(preview.baseTotal)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>+ Рентабельність:</span>
                      <span className="font-medium">{formatCurrency(preview.profitAmount)}</span>
                    </div>
                    {preview.logisticsCost > 0 && (
                      <div className="flex justify-between text-blue-600">
                        <span>+ Логістика:</span>
                        <span className="font-medium">{formatCurrency(preview.logisticsCost)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-green-200 pt-1">
                      <span>Разом з рентабельністю та логістикою:</span>
                      <span className="font-medium">{formatCurrency(preview.totalWithLogistics)}</span>
                    </div>
                    {preview.taxRate > 0 && (
                      <div className="flex justify-between text-orange-600">
                        <span>+ Податок ({preview.taxRate}%):</span>
                        <span className="font-medium">{formatCurrency(preview.taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t-2 border-green-300 pt-2 text-base font-bold text-green-700">
                      <span>ФІНАЛЬНА ЦІНА ДЛЯ КЛІЄНТА:</span>
                      <span>{formatCurrency(preview.finalPrice)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-sm font-medium">Примітки (опціонально)</label>
                <textarea
                  value={financeNotes}
                  onChange={(e) => setFinanceNotes(e.target.value)}
                  placeholder="Додаткові примітки..."
                  className="w-full mt-2 rounded border px-3 py-2 text-sm outline-none focus:border-primary"
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-4 border-t sticky bottom-0 bg-white">
                <Button
                  variant="outline"
                  onClick={() => setFinanceModalOpen(false)}
                  disabled={applyingFinance}
                >
                  Скасувати
                </Button>
                <Button
                  onClick={applyFinancialSettings}
                  disabled={applyingFinance}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {applyingFinance ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Застосування...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Застосувати
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Supplement Modal */}
      {supplementModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Plus className="h-5 w-5 text-orange-600" />
                    Доповнити кошторис новими даними
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Додайте нову інформацію або файли для регенерації кошторису
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSupplementModalOpen(false);
                    setSupplementInfo("");
                    setSupplementFiles([]);
                    setSupplementProgress(null);
                    setSupplementError("");
                  }}
                  disabled={supplementing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {supplementError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive/80">{supplementError}</p>
                  </div>
                </div>
              )}

              {supplementProgress && (
                <div className="rounded-lg bg-primary/10 border border-primary/20 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">{supplementProgress.message}</span>
                  </div>
                  <div className="w-full bg-primary/20 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${supplementProgress.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{supplementProgress.progress}%</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Додаткова інформація</label>
                <textarea
                  value={supplementInfo}
                  onChange={(e) => setSupplementInfo(e.target.value)}
                  placeholder="Опишіть що було пропущено або які зміни потрібні..."
                  className="w-full min-h-[150px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  disabled={supplementing}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Нові файли (опційно)</label>
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => {
                      if (e.target.files) {
                        setSupplementFiles(Array.from(e.target.files));
                      }
                    }}
                    className="hidden"
                    id="supplement-file-input"
                    disabled={supplementing}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('supplement-file-input')?.click()}
                    disabled={supplementing}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Завантажити файли
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    PDF, фото креслень, специфікації
                  </p>
                </div>

                {supplementFiles.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <p className="text-sm font-medium">Вибрані файли:</p>
                    {supplementFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          {file.type.startsWith('image/') ? (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({formatFileSize(file.size)})
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSupplementFiles(prev => prev.filter((_, i) => i !== idx));
                          }}
                          disabled={supplementing}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSupplementModalOpen(false);
                    setSupplementInfo("");
                    setSupplementFiles([]);
                    setSupplementProgress(null);
                    setSupplementError("");
                  }}
                  disabled={supplementing}
                >
                  Скасувати
                </Button>
                <Button
                  onClick={supplementEstimate}
                  disabled={supplementing || (!supplementInfo.trim() && supplementFiles.length === 0)}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {supplementing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Обробка...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Доповнити кошторис
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
