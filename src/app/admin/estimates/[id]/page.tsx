"use client";

import { useState, useEffect, use } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Send, CheckCircle, XCircle, Calculator, Loader2, DollarSign } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  REVISION: "bg-yellow-100 text-yellow-700",
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
  // Financial fields
  profitMarginMaterials: number | null;
  profitMarginLabor: number | null;
  profitMarginOverall: number;
  profitAmount: number;
  taxationType: string | null;
  taxRate: number;
  taxAmount: number;
  finalClientPrice: number;
  createdAt: string;
  project: { title: string; client: { name: string } };
  createdBy: { name: string };
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      id: string;
      description: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      laborRate: number;
      laborHours: number;
      amount: number;
      material: { name: string; sku: string } | null;
    }>;
  }>;
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
  const [applyingFinance, setApplyingFinance] = useState(false);
  const [separateMargins, setSeparateMargins] = useState(false);
  const [financeForm, setFinanceForm] = useState({
    profitMarginOverall: 20,
    profitMarginMaterials: 20,
    profitMarginLabor: 20,
    taxationType: "CASH" as "CASH" | "FOP" | "VAT",
    financeNotes: "",
  });

  useEffect(() => {
    fetch(`/api/admin/estimates/${id}`)
      .then((r) => r.json())
      .then(({ data }) => setEstimate(data));
  }, [id]);

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

  async function applyFinancialSettings() {
    setApplyingFinance(true);
    try {
      const body = separateMargins
        ? {
            profitMarginMaterials: financeForm.profitMarginMaterials,
            profitMarginLabor: financeForm.profitMarginLabor,
            taxationType: financeForm.taxationType,
            financeNotes: financeForm.financeNotes,
          }
        : {
            profitMarginOverall: financeForm.profitMarginOverall,
            taxationType: financeForm.taxationType,
            financeNotes: financeForm.financeNotes,
          };

      const res = await fetch(`/api/admin/estimates/${id}/finance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const { data } = await res.json();
        // Reload estimate to get updated financial data
        const estimateRes = await fetch(`/api/admin/estimates/${id}`);
        const estimateData = await estimateRes.json();
        setEstimate(estimateData.data);
        setFinanceModalOpen(false);
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

    const baseTotal = estimate.totalAmount;
    let profitAmount = 0;

    if (separateMargins) {
      const materialsProfit = estimate.totalMaterials * (financeForm.profitMarginMaterials / 100);
      const laborProfit = (estimate.totalLabor + estimate.totalOverhead) * (financeForm.profitMarginLabor / 100);
      profitAmount = materialsProfit + laborProfit;
    } else {
      profitAmount = baseTotal * (financeForm.profitMarginOverall / 100);
    }

    const totalWithProfit = baseTotal + profitAmount;

    let taxRate = 0;
    if (financeForm.taxationType === "FOP") taxRate = 6;
    if (financeForm.taxationType === "VAT") taxRate = 20;

    const taxAmount = totalWithProfit * (taxRate / 100);
    const finalPrice = totalWithProfit + taxAmount;

    return {
      baseTotal,
      profitAmount,
      totalWithProfit,
      taxRate,
      taxAmount,
      finalPrice,
    };
  };

  const preview = calculatePreview();

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
        <div className="flex gap-2">
          {/* Financial settings button (for FINANCIER and SUPER_ADMIN) */}
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
          {estimate.status === "SENT" && (
            <>
              <Button
                size="sm"
                disabled={updating}
                onClick={() => updateStatus("APPROVED")}
              >
                <CheckCircle className="h-4 w-4" />
                Затвердити
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={updating}
                onClick={() => updateStatus("REJECTED")}
              >
                <XCircle className="h-4 w-4" />
                Відхилити
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Sections with items */}
      {estimate.sections.map((section) => (
        <Card key={section.id} className="mb-4 overflow-hidden">
          <div className="bg-muted/50 px-4 py-2.5">
            <h3 className="font-medium text-sm">{section.title}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Позиція</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Од.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">К-ть</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Ціна</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Робота</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Сума</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-sm">
                      {item.description}
                      {item.material && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({item.material.sku})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{item.unit}</td>
                    <td className="px-4 py-2.5 text-sm text-right">{Number(item.quantity)}</td>
                    <td className="px-4 py-2.5 text-sm text-right">
                      {formatCurrency(Number(item.unitPrice))}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">
                      {Number(item.laborHours) > 0
                        ? `${Number(item.laborHours)}г × ${formatCurrency(Number(item.laborRate))}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right font-medium">
                      {formatCurrency(Number(item.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

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

          {/* Financial calculations (if applied) */}
          {estimate.profitAmount > 0 && (
            <>
              <div className="flex justify-between text-green-600">
                <span>Рентабельність ({Number(estimate.profitMarginOverall)}%)</span>
                <span>+{formatCurrency(Number(estimate.profitAmount))}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">З рентабельністю</span>
                <span className="font-medium">
                  {formatCurrency(Number(estimate.totalAmount) + Number(estimate.profitAmount))}
                </span>
              </div>
            </>
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

      {/* Finance Modal */}
      {financeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-green-600" />
                    Налаштування фінансів
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Додайте рентабельність та оберіть тип оподаткування
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFinanceModalOpen(false)}
                  disabled={applyingFinance}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>

              {/* Current totals */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Матеріали</p>
                  <p className="font-semibold">{formatCurrency(Number(estimate.totalMaterials))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Роботи</p>
                  <p className="font-semibold">{formatCurrency(Number(estimate.totalLabor))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Сира вартість</p>
                  <p className="font-semibold text-primary">{formatCurrency(Number(estimate.totalAmount))}</p>
                </div>
              </div>

              {/* Profit margin settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Рентабельність</label>
                  <button
                    onClick={() => setSeparateMargins(!separateMargins)}
                    className="text-xs text-primary hover:underline"
                  >
                    {separateMargins ? "Загальна" : "Окремо для матеріалів і робіт"}
                  </button>
                </div>

                {!separateMargins ? (
                  <div>
                    <label className="text-sm text-muted-foreground">Загальна рентабельність</label>
                    <div className="flex items-center gap-3 mt-2">
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="1"
                        value={financeForm.profitMarginOverall}
                        onChange={(e) =>
                          setFinanceForm((p) => ({ ...p, profitMarginOverall: Number(e.target.value) }))
                        }
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={financeForm.profitMarginOverall}
                        onChange={(e) =>
                          setFinanceForm((p) => ({ ...p, profitMarginOverall: Number(e.target.value) }))
                        }
                        className="w-20 rounded border px-2 py-1 text-sm text-right"
                      />
                      <span className="text-sm">%</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm text-muted-foreground">Рентабельність матеріалів</label>
                      <div className="flex items-center gap-3 mt-2">
                        <input
                          type="range"
                          min="0"
                          max="50"
                          step="1"
                          value={financeForm.profitMarginMaterials}
                          onChange={(e) =>
                            setFinanceForm((p) => ({ ...p, profitMarginMaterials: Number(e.target.value) }))
                          }
                          className="flex-1"
                        />
                        <input
                          type="number"
                          value={financeForm.profitMarginMaterials}
                          onChange={(e) =>
                            setFinanceForm((p) => ({ ...p, profitMarginMaterials: Number(e.target.value) }))
                          }
                          className="w-20 rounded border px-2 py-1 text-sm text-right"
                        />
                        <span className="text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Рентабельність робіт</label>
                      <div className="flex items-center gap-3 mt-2">
                        <input
                          type="range"
                          min="0"
                          max="50"
                          step="1"
                          value={financeForm.profitMarginLabor}
                          onChange={(e) =>
                            setFinanceForm((p) => ({ ...p, profitMarginLabor: Number(e.target.value) }))
                          }
                          className="flex-1"
                        />
                        <input
                          type="number"
                          value={financeForm.profitMarginLabor}
                          onChange={(e) =>
                            setFinanceForm((p) => ({ ...p, profitMarginLabor: Number(e.target.value) }))
                          }
                          className="w-20 rounded border px-2 py-1 text-sm text-right"
                        />
                        <span className="text-sm">%</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Tax type */}
              <div>
                <label className="text-sm font-medium">Тип оподаткування</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button
                    onClick={() => setFinanceForm((p) => ({ ...p, taxationType: "CASH" }))}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      financeForm.taxationType === "CASH"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-border hover:border-green-200"
                    }`}
                  >
                    💵 Готівка
                    <div className="text-xs text-muted-foreground mt-1">Без податків</div>
                  </button>
                  <button
                    onClick={() => setFinanceForm((p) => ({ ...p, taxationType: "FOP" }))}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      financeForm.taxationType === "FOP"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-border hover:border-blue-200"
                    }`}
                  >
                    👤 ФОП
                    <div className="text-xs text-muted-foreground mt-1">3-я група, 6%</div>
                  </button>
                  <button
                    onClick={() => setFinanceForm((p) => ({ ...p, taxationType: "VAT" }))}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      financeForm.taxationType === "VAT"
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
                    <div className="flex justify-between border-t border-green-200 pt-1">
                      <span>Разом з рентабельністю:</span>
                      <span className="font-medium">{formatCurrency(preview.totalWithProfit)}</span>
                    </div>
                    {preview.taxRate > 0 && (
                      <>
                        <div className="flex justify-between text-orange-600">
                          <span>+ Податок ({preview.taxRate}%):</span>
                          <span className="font-medium">{formatCurrency(preview.taxAmount)}</span>
                        </div>
                      </>
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
                  value={financeForm.financeNotes}
                  onChange={(e) => setFinanceForm((p) => ({ ...p, financeNotes: e.target.value }))}
                  placeholder="Додаткові примітки..."
                  className="w-full mt-2 rounded border px-3 py-2 text-sm outline-none focus:border-primary"
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-4 border-t">
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
    </div>
  );
}
