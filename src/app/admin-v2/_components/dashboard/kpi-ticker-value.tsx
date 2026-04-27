"use client";

import { NumberTicker } from "@/components/motion";

export function KpiTickerValue({
  value,
  prefix,
  suffix,
  decimals = 0,
  fallback,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  fallback?: string;
}) {
  if (!Number.isFinite(value)) {
    return <>{fallback ?? "—"}</>;
  }
  return (
    <NumberTicker
      value={value}
      prefix={prefix}
      suffix={suffix}
      decimals={decimals}
      duration={1.4}
      stiffness={110}
      damping={18}
    />
  );
}
