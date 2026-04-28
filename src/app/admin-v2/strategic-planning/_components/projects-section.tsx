"use client";

import { useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { ChevronDown, FolderKanban } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyCompact } from "@/lib/utils";
import type {
  ProjectDTO,
  ProjectOverride,
} from "@/lib/strategic-planning/types";

export function ProjectsSection({
  projects,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  overrides,
  onOverrideChange,
}: {
  projects: ProjectDTO[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  overrides: Record<string, ProjectOverride>;
  onOverrideChange: (id: string, value: number | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const allSelected =
    projects.length > 0 && selectedIds.size === projects.length;

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
            style={{ background: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            <FolderKanban className="h-4 w-4" />
          </div>
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: T.textPrimary }}
            >
              Проєкти (дохід)
            </div>
            <div className="text-xs" style={{ color: T.textMuted }}>
              {selectedIds.size} обрано · {projects.length} доступно
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
          {projects.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                {selectedIds.size} / {projects.length}
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
          {projects.length === 0 && (
            <p
              className="px-2 py-3 text-sm"
              style={{ color: T.textMuted }}
            >
              Немає проектів зі статусом DRAFT/ACTIVE для цієї фірми.
            </p>
          )}
          {projects.map((p) => {
            const checked = selectedIds.has(p.id);
            const remaining = Math.max(0, p.totalBudget - p.totalPaid);
            const override = overrides[p.id]?.monthlyAmount ?? "";
            return (
              <div
                key={p.id}
                className="flex flex-col gap-1.5 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
              >
                <label className="flex min-h-[44px] items-center gap-2.5">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(p.id)}
                    className="h-5 w-5"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className="truncate text-sm font-medium"
                      style={{ color: T.textPrimary }}
                    >
                      {p.title}
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ color: T.textMuted }}
                    >
                      {p.startDate
                        ? format(new Date(p.startDate), "LLL yyyy", { locale: uk })
                        : "—"}
                      {" → "}
                      {p.expectedEndDate
                        ? format(new Date(p.expectedEndDate), "LLL yyyy", {
                            locale: uk,
                          })
                        : "—"}
                    </span>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {formatCurrencyCompact(remaining)}
                  </Badge>
                </label>
                {checked && (
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="₴ / міс (override)"
                    value={override}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      onOverrideChange(p.id, v === null || isNaN(v) ? null : v);
                    }}
                    className="ml-7 h-9 max-w-[200px] rounded-lg border px-2 text-right text-xs"
                    style={{
                      borderColor: T.borderSoft,
                      color: T.textPrimary,
                      background: T.panelSoft,
                    }}
                    title="Замінити рівномірний розподіл вручну"
                  />
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
