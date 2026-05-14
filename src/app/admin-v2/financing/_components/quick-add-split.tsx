"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Plus,
  Wallet,
  Coins,
  ArrowDownToLine,
  Hourglass,
  Scale,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { QuadrantPreset } from "./types";

/**
 * Phase 4 — intent-first picker. Замість технічних PLAN/FACT × INCOME/EXPENSE
 * показуємо 5 бізнес-сценаріїв з планом ADMIN_V2_UX_UI_SIMPLIFICATION_PLAN:
 *  1. Витрата вже оплачена         → FACT + EXPENSE + ACTUAL
 *  2. Є борг постачальнику         → FACT + EXPENSE + COMMITTED
 *  3. Надійшли гроші від клієнта   → FACT + INCOME  + ACTUAL
 *  4. Нам мають заплатити          → FACT + INCOME  + COMMITTED
 *  5. Планова сума бюджету         → PLAN + EXPENSE + BUDGET (за замовч.)
 *
 * Для випадку 5 модалка показує наступний крок «витрата чи дохід» — або юзер
 * перевизначить type у формі. За дефолтом стартуємо з EXPENSE як найчастіший.
 */
type Scenario = {
  key: string;
  label: string;
  hint: string;
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  intent: "BUDGET" | "COMMITTED" | "ACTUAL";
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  accent: string;
};

const SCENARIOS: Scenario[] = [
  {
    key: "expense-paid",
    label: "Витрата вже оплачена",
    hint: "Оплата картою / готівкою / переказом",
    kind: "FACT",
    type: "EXPENSE",
    intent: "ACTUAL",
    icon: Wallet,
    accent: T.success,
  },
  {
    key: "supplier-debt",
    label: "Є борг постачальнику",
    hint: "Матеріал отримано, оплати ще не було",
    kind: "FACT",
    type: "EXPENSE",
    intent: "COMMITTED",
    icon: Coins,
    accent: T.warning,
  },
  {
    key: "income-received",
    label: "Надійшли гроші від клієнта",
    hint: "Передплата / транш на рахунок",
    kind: "FACT",
    type: "INCOME",
    intent: "ACTUAL",
    icon: ArrowDownToLine,
    accent: T.success,
  },
  {
    key: "income-expected",
    label: "Нам мають заплатити",
    hint: "Виставлений рахунок / акт",
    kind: "FACT",
    type: "INCOME",
    intent: "COMMITTED",
    icon: Hourglass,
    accent: T.accentPrimary,
  },
  {
    key: "budget-plan",
    label: "Планова сума бюджету",
    hint: "Запланувати витрату або надходження",
    kind: "PLAN",
    type: "EXPENSE",
    intent: "BUDGET",
    icon: Scale,
    accent: T.violet,
  },
];

const DEFAULT_SCENARIO = SCENARIOS[0]; // «Витрата вже оплачена» — найчастіше

export function QuickAddSplit({
  onPick,
  compact,
}: {
  onPick: (preset: QuadrantPreset) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const pick = (s: Scenario) => {
    onPick({ kind: s.kind, type: s.type, intent: s.intent });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => pick(DEFAULT_SCENARIO)}
        title={DEFAULT_SCENARIO.hint}
        className={`flex items-center gap-1.5 rounded-l-xl ${
          compact ? "px-3 py-2" : "px-4 py-2.5"
        } text-[12px] sm:text-xs font-bold text-white transition hover:brightness-110`}
        style={{ backgroundColor: T.accentPrimary }}
      >
        <Plus size={13} />
        <span>Додати</span>
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Інші сценарії"
        title="Інші сценарії додавання"
        className={`flex items-center justify-center rounded-r-xl ${
          compact ? "px-2 py-2" : "px-2.5 py-2.5"
        } border-l border-white/20 text-white transition hover:brightness-110`}
        style={{ backgroundColor: T.accentPrimary }}
      >
        <ChevronDown
          size={14}
          style={{
            transition: "transform 200ms",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[320px] rounded-2xl p-1.5 z-50"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderStrong}`,
            boxShadow: "0 12px 32px -8px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <div
            className="px-3 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted, letterSpacing: "0.08em" }}
          >
            Що ви хочете внести?
          </div>
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                role="menuitem"
                onClick={() => pick(s)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = T.panelSoft)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                  style={{ backgroundColor: `${s.accent}1f`, color: s.accent }}
                >
                  <Icon size={15} strokeWidth={2} />
                </span>
                <span className="flex flex-col min-w-0">
                  <span
                    className="text-[12.5px] font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    {s.label}
                  </span>
                  <span className="text-[11px]" style={{ color: T.textMuted }}>
                    {s.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
