"use client";

import { useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyCompact } from "@/lib/utils";
import {
  HOURS_PER_MONTH,
  type EmployeeDTO,
} from "@/lib/strategic-planning/types";

export function StaffSection({
  employees,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  employees: EmployeeDTO[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(true);
  const allSelected =
    employees.length > 0 && selectedIds.size === employees.length;

  return (
    <Card className="border-0 shadow-sm" style={{ background: T.panel }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: T.violetSoft, color: T.violet }}
          >
            <Users className="h-4 w-4" />
          </div>
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: T.textPrimary }}
            >
              Співробітники (ЗП)
            </div>
            <div className="text-xs" style={{ color: T.textMuted }}>
              {selectedIds.size} обрано · {employees.length} доступно
            </div>
          </div>
        </div>
        <ChevronDown
          className="h-4 w-4 transition-transform"
          style={{
            color: T.textMuted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <CardContent className="flex flex-col gap-1.5 p-2 pt-0">
          {employees.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                {selectedIds.size} / {employees.length}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onSelectAll}
                  disabled={allSelected}
                  className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all disabled:opacity-40"
                  style={{
                    borderColor: T.borderSoft,
                    background: T.accentPrimarySoft,
                    color: T.accentPrimary,
                  }}
                >
                  Обрати всіх
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  disabled={selectedIds.size === 0}
                  className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all disabled:opacity-40"
                  style={{
                    borderColor: T.borderSoft,
                    color: T.textSecondary,
                  }}
                >
                  Зняти всі
                </button>
              </div>
            </div>
          )}
          {employees.length === 0 && (
            <p
              className="px-2 py-3 text-sm"
              style={{ color: T.textMuted }}
            >
              Немає активних співробітників із заданою ЗП.
            </p>
          )}
          {employees.map((e) => {
            const checked = selectedIds.has(e.id);
            const burden = e.burdenMultiplier ?? 0;
            const baseMonthly =
              e.salaryType === "MONTHLY"
                ? e.salaryAmount
                : e.salaryAmount * HOURS_PER_MONTH;
            const monthlyCost = baseMonthly * (1 + burden);
            return (
              <label
                key={e.id}
                className="flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(e.id)}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="truncate text-sm font-medium"
                    style={{ color: T.textPrimary }}
                  >
                    {e.fullName}
                  </span>
                  <span
                    className="truncate text-xs"
                    style={{ color: T.textMuted }}
                  >
                    {e.position ?? "—"}
                    {e.salaryType === "HOURLY" ? " · погодинно" : ""}
                    {burden > 0 ? ` · burden ×${(1 + burden).toFixed(2)}` : ""}
                  </span>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {formatCurrencyCompact(monthlyCost)} / міс
                </Badge>
              </label>
            );
          })}
          <p
            className="px-2 pt-2 text-[11px]"
            style={{ color: T.textMuted }}
          >
            Погодинні рахуються як ставка × {HOURS_PER_MONTH} год — це грубо.
            При потребі — додай custom-рядок із точною сумою.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
