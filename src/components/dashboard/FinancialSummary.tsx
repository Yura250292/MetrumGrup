import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { Wallet, TrendingUp, Clock } from "lucide-react";

interface FinancialSummaryProps {
  totalBudget: number;
  totalPaid: number;
}

export function FinancialSummary({ totalBudget, totalPaid }: FinancialSummaryProps) {
  const remaining = totalBudget - totalPaid;
  const percentage = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress overview */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold">Оплата проєкту</span>
          <span className="text-2xl font-bold text-primary">{percentage}%</span>
        </div>
        <Progress
          value={percentage}
          className="h-3"
          indicatorClassName="bg-gradient-to-r from-primary to-amber-400"
        />
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>Сплачено: {formatCurrency(totalPaid)}</span>
          <span>Всього: {formatCurrency(totalBudget)}</span>
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Вартість</p>
              <p className="text-lg font-bold tracking-tight">{formatCurrency(totalBudget)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Сплачено</p>
              <p className="text-lg font-bold tracking-tight text-green-600">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Залишок</p>
              <p className="text-lg font-bold tracking-tight text-primary">{formatCurrency(remaining)}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
