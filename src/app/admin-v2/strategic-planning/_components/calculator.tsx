"use client";

import { useMemo, useState } from "react";
import { startOfMonth } from "date-fns";
import { TrendingUp, Info } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Badge } from "@/components/ui/badge";
import { buildForecast } from "@/lib/strategic-planning/forecast";
import type {
  CustomItem,
  InitialData,
  Period,
  ProjectOverride,
} from "@/lib/strategic-planning/types";
import { PeriodPicker } from "./period-picker";
import { ProjectsSection } from "./projects-section";
import { StaffSection } from "./staff-section";
import { TemplatesSection } from "./templates-section";
import { CustomItemsSection } from "./custom-items-section";
import { SummaryKpis } from "./summary-kpis";
import { CashflowChart } from "./cashflow-chart";
import { MonthlyTable } from "./monthly-table";
import { ExportButtons } from "./export-buttons";

export function Calculator({ initialData }: { initialData: InitialData }) {
  const [period, setPeriod] = useState<Period>(() => ({
    startMonth: startOfMonth(new Date()).toISOString(),
    durationMonths: 6,
  }));
  const [openingBalance, setOpeningBalance] = useState(0);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [projectOverrides, setProjectOverrides] = useState<Record<string, ProjectOverride>>({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);

  const forecast = useMemo(
    () =>
      buildForecast({
        period,
        openingBalance,
        projects: initialData.projects,
        selectedProjectIds: Array.from(selectedProjectIds),
        projectOverrides,
        employees: initialData.employees,
        selectedEmployeeIds: Array.from(selectedEmployeeIds),
        templates: initialData.templates,
        selectedTemplateIds: Array.from(selectedTemplateIds),
        customItems,
      }),
    [
      period,
      openingBalance,
      initialData,
      selectedProjectIds,
      projectOverrides,
      selectedEmployeeIds,
      selectedTemplateIds,
      customItems,
    ],
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl md:h-12 md:w-12"
            style={{
              background: T.accentPrimarySoft,
              color: T.accentPrimary,
            }}
          >
            <TrendingUp className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-xl font-bold tracking-tight md:text-2xl"
              style={{ color: T.textPrimary }}
            >
              Стратегічне планування
            </h1>
            <p
              className="mt-0.5 hidden text-sm md:block"
              style={{ color: T.textSecondary }}
            >
              Калькулятор-прогноз. Обери проекти, штат і постійні витрати —
              отримай помісячний cashflow.
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5">
              <Badge variant="warning">
                <Info className="mr-1 h-3 w-3" />
                <span className="hidden sm:inline">
                  Чорнетка — нічого не зберігається в БД
                </span>
                <span className="sm:hidden">Чорнетка</span>
              </Badge>
            </div>
          </div>
        </div>
        <ExportButtons forecast={forecast} period={period} />
      </header>

      {/* Period + opening balance */}
      <PeriodPicker
        period={period}
        onPeriodChange={setPeriod}
        openingBalance={openingBalance}
        onOpeningBalanceChange={setOpeningBalance}
      />

      {/* Selection sections */}
      <div className="grid gap-4 md:grid-cols-2">
        <ProjectsSection
          projects={initialData.projects}
          selectedIds={selectedProjectIds}
          onToggle={(id) =>
            setSelectedProjectIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onSelectAll={() =>
            setSelectedProjectIds(
              new Set(initialData.projects.map((p) => p.id)),
            )
          }
          onClearAll={() => setSelectedProjectIds(new Set())}
          overrides={projectOverrides}
          onOverrideChange={(id, value) =>
            setProjectOverrides((prev) => {
              const next = { ...prev };
              if (value === null) delete next[id];
              else next[id] = { monthlyAmount: value };
              return next;
            })
          }
        />
        <StaffSection
          employees={initialData.employees}
          selectedIds={selectedEmployeeIds}
          onToggle={(id) =>
            setSelectedEmployeeIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onSelectAll={() =>
            setSelectedEmployeeIds(
              new Set(initialData.employees.map((e) => e.id)),
            )
          }
          onClearAll={() => setSelectedEmployeeIds(new Set())}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TemplatesSection
          templates={initialData.templates}
          selectedIds={selectedTemplateIds}
          onToggle={(id) =>
            setSelectedTemplateIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onSelectAll={() =>
            setSelectedTemplateIds(
              new Set(initialData.templates.map((t) => t.id)),
            )
          }
          onClearAll={() => setSelectedTemplateIds(new Set())}
        />
        <CustomItemsSection
          items={customItems}
          maxMonth={period.durationMonths}
          onAdd={(item) => setCustomItems((prev) => [...prev, item])}
          onRemove={(id) =>
            setCustomItems((prev) => prev.filter((c) => c.id !== id))
          }
        />
      </div>

      {/* Summary */}
      <SummaryKpis
        summary={forecast.summary}
        months={forecast.months}
        openingBalance={openingBalance}
      />

      {/* Chart */}
      <CashflowChart forecast={forecast} />

      {/* Monthly table */}
      <MonthlyTable forecast={forecast} />
    </div>
  );
}
