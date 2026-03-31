"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaxationType } from "@prisma/client";
import { Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface TaxBreakdownCardProps {
  taxationType: TaxationType;
  taxBreakdown?: {
    pdvAmount: number;
    esvAmount: number;
    militaryTaxAmount: number;
    profitTaxAmount: number;
    unifiedTaxAmount: number;
    pdfoAmount: number;
    totalTaxAmount: number;
    netProfit: number;
    effectiveTaxRate: number;
  };
  totalMargin: number;
  className?: string;
}

export function TaxBreakdownCard({
  taxationType,
  taxBreakdown,
  totalMargin,
  className,
}: TaxBreakdownCardProps) {
  if (!taxBreakdown || taxationType === "CASH") {
    return (
      <Card className={className}>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-2">Податкове навантаження</h3>
          <p className="text-sm text-muted-foreground">
            {taxationType === "CASH" ? "Готівка - без податків" : "Дані про податки недоступні"}
          </p>
        </div>
      </Card>
    );
  }

  const isVAT = taxationType === "VAT";
  const isFOP = taxationType === "FOP";

  return (
    <Card className={className}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">Податкове навантаження</h3>
            <Badge variant={isVAT ? "default" : "secondary"}>
              {isVAT ? "ТОВ з ПДВ" : "ФОП 3 група"}
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{taxBreakdown.effectiveTaxRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Ефективна ставка</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* ТОВ з ПДВ */}
          {isVAT && (
            <>
              <TaxRow
                label="ПДВ (20%)"
                amount={taxBreakdown.pdvAmount}
                note="Транзитний податок для клієнта"
                variant="warning"
              />
              <TaxRow
                label="ЄСВ (22%)"
                amount={taxBreakdown.esvAmount}
                note="На фонд оплати праці"
              />
              <TaxRow
                label="ПДФО (18%)"
                amount={taxBreakdown.pdfoAmount}
                note="З заробітної плати"
              />
              <TaxRow
                label="Військовий збір (1.5%)"
                amount={taxBreakdown.militaryTaxAmount}
                note="З заробітної плати"
              />
              <TaxRow
                label="Податок на прибуток (18%)"
                amount={taxBreakdown.profitTaxAmount}
                note="Після інших податків"
              />
            </>
          )}

          {/* ФОП 3 група */}
          {isFOP && (
            <>
              <TaxRow
                label="Єдиний податок (5%)"
                amount={taxBreakdown.unifiedTaxAmount}
                note="Від загальної суми доходу"
                variant="primary"
              />
              <TaxRow
                label="ЄСВ (22%)"
                amount={taxBreakdown.esvAmount}
                note="Від бази (мінімум мін. ЗП)"
              />
              <TaxRow
                label="Військовий збір (1.5%)"
                amount={taxBreakdown.militaryTaxAmount}
                note="Від доходу"
              />
            </>
          )}

          <div className="border-t pt-3 mt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Загальне податкове навантаження:</span>
              <span className="text-lg font-bold text-destructive">
                {formatCurrency(taxBreakdown.totalTaxAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Рентабельність:</span>
              <span className="font-medium">{formatCurrency(totalMargin)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Чистий прибуток:</span>
              <span className="font-medium text-green-600">
                {formatCurrency(taxBreakdown.netProfit)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              {isVAT
                ? "ПДВ є транзитним податком і сплачується клієнтом. Інші податки - це реальні витрати компанії."
                : "Розрахунок включає всі обов'язкові податки та збори для ФОП 3 групи."}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TaxRow({
  label,
  amount,
  note,
  variant = "default",
}: {
  label: string;
  amount: number;
  note: string;
  variant?: "default" | "primary" | "warning";
}) {
  const colorClass =
    variant === "primary"
      ? "text-blue-600"
      : variant === "warning"
      ? "text-orange-600"
      : "text-foreground";

  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{note}</p>
      </div>
      <span className={`text-sm font-semibold flex-shrink-0 ${colorClass}`}>
        {formatCurrency(amount)}
      </span>
    </div>
  );
}
