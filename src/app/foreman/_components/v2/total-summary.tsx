"use client";

interface TotalSummaryProps {
  total: number;
  itemsCount: number;
  hint?: string;
}

export function TotalSummary({ total, itemsCount, hint }: TotalSummaryProps) {
  return (
    <div className="rounded-2xl bg-slate-900 text-white px-4 py-3.5 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.45)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-slate-300">Підсумок</span>
        <span className="text-[22px] font-extrabold tabular-nums">
          {formatUah(total)}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-slate-400">
        {itemsCount} {wordForms(itemsCount, ["позиція", "позиції", "позицій"])}
        {hint ? ` · ${hint}` : ""}
      </div>
    </div>
  );
}

function formatUah(n: number): string {
  return `${n.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴`;
}

function wordForms(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
