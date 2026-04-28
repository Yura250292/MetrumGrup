"use client";

import { useState } from "react";
import { ChevronDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyCompact } from "@/lib/utils";
import type { CustomItem } from "@/lib/strategic-planning/types";

export function CustomItemsSection({
  items,
  maxMonth,
  onAdd,
  onRemove,
}: {
  items: CustomItem[];
  maxMonth: number;
  onAdd: (item: CustomItem) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<{
    label: string;
    type: "INCOME" | "EXPENSE";
    amount: string;
    mode: "MONTHLY" | "ONE_TIME";
    startMonthIndex: number;
    durationMonths: number;
  }>({
    label: "",
    type: "INCOME",
    amount: "",
    mode: "MONTHLY",
    startMonthIndex: 0,
    durationMonths: 6,
  });

  function reset() {
    setDraft({
      label: "",
      type: "INCOME",
      amount: "",
      mode: "MONTHLY",
      startMonthIndex: 0,
      durationMonths: 6,
    });
  }

  function handleAdd() {
    const amount = Number(draft.amount);
    if (!amount || amount <= 0) return;
    onAdd({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: draft.label.trim(),
      type: draft.type,
      amount,
      mode: draft.mode,
      startMonthIndex: Math.max(
        0,
        Math.min(maxMonth - 1, draft.startMonthIndex),
      ),
      durationMonths: Math.max(1, Math.min(maxMonth, draft.durationMonths)),
    });
    reset();
  }

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
            style={{ background: T.tealSoft, color: T.teal }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: T.textPrimary }}
            >
              Власні рядки
            </div>
            <div className="text-xs" style={{ color: T.textMuted }}>
              {items.length} додано — гіпотетичні доходи / витрати
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
        <CardContent className="flex flex-col gap-3 p-3 pt-0">
          {/* Existing items */}
          {items.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2"
                  style={{ borderColor: T.borderSoft }}
                >
                  <Badge
                    variant={item.type === "INCOME" ? "success" : "destructive"}
                    className="shrink-0"
                  >
                    {item.type === "INCOME" ? "Дохід" : "Витрата"}
                  </Badge>
                  <span
                    className="flex-1 truncate text-sm font-medium"
                    style={{ color: T.textPrimary }}
                  >
                    {item.label || "Без назви"}
                  </span>
                  <span
                    className="text-xs whitespace-nowrap"
                    style={{ color: T.textMuted }}
                  >
                    {item.mode === "MONTHLY"
                      ? `${formatCurrencyCompact(item.amount)} / міс × ${item.durationMonths}`
                      : `${formatCurrencyCompact(item.amount)} разово`}
                    {" · міс "}
                    {item.startMonthIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-destructive/10"
                    aria-label="Видалити"
                  >
                    <Trash2
                      className="h-3.5 w-3.5"
                      style={{ color: T.danger }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Draft form */}
          <div
            className="flex flex-col gap-2 rounded-xl border p-3"
            style={{ borderColor: T.borderSoft, background: T.panelSoft }}
          >
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Назва (наприклад «Новий контракт»)"
                value={draft.label}
                onChange={(e) =>
                  setDraft({ ...draft, label: e.target.value })
                }
                className="min-w-[160px] flex-1 rounded-lg border px-3 py-1.5 text-sm"
                style={{
                  borderColor: T.borderSoft,
                  background: T.panel,
                  color: T.textPrimary,
                }}
              />
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    type: e.target.value as "INCOME" | "EXPENSE",
                  })
                }
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{
                  borderColor: T.borderSoft,
                  background: T.panel,
                  color: T.textPrimary,
                }}
              >
                <option value="INCOME">Дохід</option>
                <option value="EXPENSE">Витрата</option>
              </select>
              <select
                value={draft.mode}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mode: e.target.value as "MONTHLY" | "ONE_TIME",
                  })
                }
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{
                  borderColor: T.borderSoft,
                  background: T.panel,
                  color: T.textPrimary,
                }}
              >
                <option value="MONTHLY">Щомісячно</option>
                <option value="ONE_TIME">Разово</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                placeholder="Сума ₴"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                className="w-32 rounded-lg border px-3 py-1.5 text-sm"
                style={{
                  borderColor: T.borderSoft,
                  background: T.panel,
                  color: T.textPrimary,
                }}
              />
              <label
                className="flex items-center gap-1.5 text-xs"
                style={{ color: T.textMuted }}
              >
                Стартує з місяця
                <input
                  type="number"
                  min={1}
                  max={maxMonth}
                  value={draft.startMonthIndex + 1}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      startMonthIndex: Math.max(0, Number(e.target.value) - 1),
                    })
                  }
                  className="w-16 rounded-lg border px-2 py-1 text-sm"
                  style={{
                    borderColor: T.borderSoft,
                    background: T.panel,
                    color: T.textPrimary,
                  }}
                />
              </label>
              {draft.mode === "MONTHLY" && (
                <label
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: T.textMuted }}
                >
                  Триває
                  <input
                    type="number"
                    min={1}
                    max={maxMonth}
                    value={draft.durationMonths}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        durationMonths: Number(e.target.value) || 1,
                      })
                    }
                    className="w-16 rounded-lg border px-2 py-1 text-sm"
                    style={{
                      borderColor: T.borderSoft,
                      background: T.panel,
                      color: T.textPrimary,
                    }}
                  />
                  міс
                </label>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={!draft.amount || Number(draft.amount) <= 0}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                style={{
                  background: T.accentPrimary,
                  color: "#fff",
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Додати
              </button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
