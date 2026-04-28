"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyCompact } from "@/lib/utils";
import type { TemplateDTO } from "@/lib/strategic-planning/types";

export function TemplatesSection({
  templates,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  templates: TemplateDTO[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(true);
  const allSelected =
    templates.length > 0 && selectedIds.size === templates.length;

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateDTO[]>();
    for (const t of templates) {
      const key = t.folderName;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [templates]);

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
            style={{ background: T.amberSoft, color: T.amber }}
          >
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: T.textPrimary }}
            >
              Постійні витрати
            </div>
            <div className="text-xs" style={{ color: T.textMuted }}>
              {selectedIds.size} обрано · {templates.length} шаблонів
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
        <CardContent className="flex flex-col gap-3 p-2 pt-0">
          {templates.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                {selectedIds.size} / {templates.length}
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
                  Обрати всі
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
          {templates.length === 0 && (
            <p
              className="px-2 py-3 text-sm"
              style={{ color: T.textMuted }}
            >
              Немає активних шаблонів. Створи їх у модулі Фінансування →
              Шаблони.
            </p>
          )}
          {grouped.map(([folderName, items]) => (
            <div key={folderName} className="flex flex-col gap-1">
              <div
                className="px-2 pt-1 text-[11px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                {folderName}
              </div>
              {items.map((t) => {
                const checked = selectedIds.has(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggle(t.id)}
                      className="h-5 w-5"
                    />
                    <span
                      className="flex-1 truncate text-sm font-medium"
                      style={{ color: T.textPrimary }}
                    >
                      {t.emoji ? `${t.emoji} ` : ""}
                      {t.name}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {formatCurrencyCompact(t.defaultAmount)} / міс
                    </Badge>
                  </label>
                );
              })}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
