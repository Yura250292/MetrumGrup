import type { ReactNode } from "react";

type Props = {
  label: string;
  hint?: string;
  right?: ReactNode;
};

export function SectionHeader({ label, hint, right }: Props) {
  return (
    <div className="flex items-end justify-between gap-3 pt-1">
      <div className="min-w-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-t-3">
          {label}
        </h2>
        {hint && <p className="mt-0.5 text-[13px] text-t-2">{hint}</p>}
      </div>
      {right}
    </div>
  );
}
