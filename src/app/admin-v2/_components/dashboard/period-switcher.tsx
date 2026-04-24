"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const PERIODS = [
  { id: "today", label: "Сьогодні" },
  { id: "week", label: "7 днів" },
  { id: "month", label: "Місяць" },
  { id: "quarter", label: "Квартал" },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export function PeriodSwitcher({ active }: { active: PeriodId }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const switchPeriod = (period: PeriodId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (period === "month") {
      params.delete("period");
    } else {
      params.set("period", period);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  return (
    <div
      className="premium-card flex items-center gap-1 rounded-xl p-1"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {PERIODS.map((p) => {
        const isActive = p.id === active;
        return (
          <button
            key={p.id}
            onClick={() => switchPeriod(p.id)}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
            style={{
              backgroundColor: isActive ? "var(--t-panel-el)" : "transparent",
              color: isActive ? T.textPrimary : T.textMuted,
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
