"use client";

import { Star, StarHalf } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function RatingStars({
  value,
  size = 14,
  showValue = true,
}: {
  value: number | string | null | undefined;
  size?: number;
  showValue?: boolean;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Без рейтингу
      </span>
    );
  }
  const numeric = typeof value === "string" ? Number(value) : value;
  const clamped = Math.max(0, Math.min(5, numeric));
  const full = Math.floor(clamped);
  const half = clamped - full >= 0.25 && clamped - full < 0.75 ? 1 : 0;
  const filled = clamped - full >= 0.75 ? full + 1 : full;
  const empty = 5 - filled - half;

  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: filled }).map((_, i) => (
        <Star
          key={`f${i}`}
          size={size}
          fill={T.accentPrimary}
          color={T.accentPrimary}
        />
      ))}
      {half === 1 && (
        <StarHalf
          size={size}
          fill={T.accentPrimary}
          color={T.accentPrimary}
        />
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} size={size} color={T.borderStrong} />
      ))}
      {showValue && (
        <span
          className="ml-1 text-[12px] font-semibold"
          style={{ color: T.textPrimary }}
        >
          {clamped.toFixed(1)}
        </span>
      )}
    </span>
  );
}
