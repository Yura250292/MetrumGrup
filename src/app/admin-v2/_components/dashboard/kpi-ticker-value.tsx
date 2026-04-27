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
      duration={2.2}
      stiffness={70}
      damping={22}
    />
  );
}
