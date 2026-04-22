import type { ReactNode } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  label: string;
  hint?: string;
  right?: ReactNode;
};

export function SectionHeader({ label, hint, right }: Props) {
  return (
    <div className="flex items-end justify-between gap-3 pt-1">
      <div className="min-w-0">
        <h2
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: T.textMuted }}
        >
          {label}
        </h2>
        {hint && (
          <p className="text-[13px] mt-0.5" style={{ color: T.textSecondary }}>
            {hint}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}
