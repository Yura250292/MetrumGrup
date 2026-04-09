/**
 * Format a Date or ISO timestamp as a relative "X ago" string in Ukrainian.
 */
export function timeAgo(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 60) return "щойно";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} хв тому`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} год тому`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} дн тому`;
  if (diffDay < 30) return `${Math.round(diffDay / 7)} тиж тому`;
  if (diffDay < 365) return `${Math.round(diffDay / 30)} міс тому`;
  return `${Math.round(diffDay / 365)} р тому`;
}
