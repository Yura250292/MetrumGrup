"use client";

import { useState } from "react";
import { KpiGrid } from "./kpi-grid";
import { DebtPanel } from "./debt-panel";

interface Kpis {
  planIncome: number;
  planExpense: number;
  factIncome: number;
  factExpense: number;
  totalDebt: number;
  debtorCount: number;
  activeProjects: number;
  pendingForemanReports: number;
  budgetIncome: number;
  budgetExpense: number;
  committedIncome: number;
  committedExpense: number;
  actualCashIncome: number;
  actualCashExpense: number;
}

export function KpiSection({ kpis }: { kpis: Kpis }) {
  const [debtExpanded, setDebtExpanded] = useState(false);
  const canExpand = kpis.totalDebt > 0;

  return (
    <div>
      <KpiGrid
        kpis={kpis}
        onOpenDebt={canExpand ? () => setDebtExpanded((v) => !v) : undefined}
        debtExpanded={debtExpanded}
      />
      <DebtPanel visible={canExpand && debtExpanded} />
    </div>
  );
}
