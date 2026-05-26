"use client";

type Props = {
  amount: number | null;
  className?: string;
};

/// Badge для відображення costImpact CO. Якщо amount === null →
/// користувач не має canViewFinance → показуємо «***» замість суми.
export function CostImpactBadge({ amount, className }: Props) {
  if (amount === null) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs bg-zinc-100 text-zinc-500 ${className ?? ""}`}
        title="Доступно лише фінансовим ролям"
      >
        ***
      </span>
    );
  }
  const positive = amount >= 0;
  const formatted = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        positive ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
      } ${className ?? ""}`}
    >
      {positive ? "+" : "−"}
      {formatted} ₴
    </span>
  );
}
