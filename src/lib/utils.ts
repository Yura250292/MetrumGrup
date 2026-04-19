import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Compact currency for KPI tiles — auto-abbreviates large numbers:
 *   < 10 000         → "8 500 ₴"
 *   10 000–999 999   → "125 тис ₴"
 *   1 000 000+       → "3.2 млн ₴"
 *   1 000 000 000+   → "1.5 млрд ₴"
 */
export function formatCurrencyCompact(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const abs = Math.abs(num);
  const sign = num < 0 ? "−" : "";

  if (abs >= 1_000_000_000) {
    const v = abs / 1_000_000_000;
    return `${sign}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} млрд ₴`;
  }
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} млн ₴`;
  }
  if (abs >= 10_000) {
    const v = Math.round(abs / 1_000);
    return `${sign}${v} тис ₴`;
  }
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatHours(minutes: number): string {
  if (!minutes) return "0год";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}хв`;
  if (m === 0) return `${h}год`;
  return `${h}год ${m}хв`;
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "щойно";
  if (diffMin < 60) return `${diffMin} хв тому`;
  if (diffHours < 24) return `${diffHours} год тому`;
  if (diffDays === 1) return "вчора";
  if (diffDays < 7) return `${diffDays} дн тому`;
  return `${Math.floor(diffDays / 7)} тижн тому`;
}

export function calculateProgress(stages: { status: string }[]): number {
  if (stages.length === 0) return 0;
  const completed = stages.filter((s) => s.status === "COMPLETED").length;
  const inProgress = stages.filter((s) => s.status === "IN_PROGRESS").length;
  return Math.round(((completed + inProgress * 0.5) / stages.length) * 100);
}
