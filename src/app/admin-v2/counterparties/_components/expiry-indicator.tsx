"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";

const DAY_MS = 24 * 60 * 60 * 1000;

function pickColor(daysLeft: number): { bg: string; fg: string; label: string } {
  if (daysLeft < 0) {
    return { bg: T.dangerSoft, fg: T.danger, label: "ПРОСТРОЧЕНО" };
  }
  if (daysLeft <= 7) {
    return { bg: T.dangerSoft, fg: T.danger, label: `Залишилось ${daysLeft} дн.` };
  }
  if (daysLeft <= 30) {
    return { bg: T.warningSoft, fg: T.warning, label: `Залишилось ${daysLeft} дн.` };
  }
  return { bg: T.successSoft, fg: T.success, label: "Дійсний" };
}

export function ExpiryIndicator({
  validUntil,
}: {
  validUntil: string | Date | null | undefined;
}) {
  if (!validUntil) {
    return (
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Без терміну
      </span>
    );
  }
  const date = typeof validUntil === "string" ? new Date(validUntil) : validUntil;
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / DAY_MS);
  const { bg, fg, label } = pickColor(daysLeft);
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: bg, color: fg }}
      title={date.toISOString().slice(0, 10)}
    >
      {label}
    </span>
  );
}
