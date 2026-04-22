"use client";

import { useEffect, useId, useState } from "react";

type RadialProgressProps = {
  value: number;
  size?: number;
  thickness?: number;
  trackColor?: string;
  fillColor?: string;
  trailColor?: string;
  className?: string;
  rounded?: boolean;
  children?: React.ReactNode;
  ariaLabel?: string;
  /** Delay (ms) before animation starts — useful to stagger multiple rings. */
  delay?: number;
  /** Animation duration in ms. */
  duration?: number;
  /** Disable entry animation (for static previews). */
  animate?: boolean;
};

export function RadialProgress({
  value,
  size = 40,
  thickness = 4,
  trackColor,
  fillColor = "currentColor",
  trailColor,
  className,
  rounded = true,
  children,
  ariaLabel,
  delay = 0,
  duration = 900,
  animate = true,
}: RadialProgressProps) {
  const clamped = Math.max(0, Math.min(100, isFinite(value) ? value : 0));
  const [rendered, setRendered] = useState(animate ? 0 : clamped);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (!animate || reduced) {
      setRendered(clamped);
      return;
    }
    const t = setTimeout(() => setRendered(clamped), delay);
    return () => clearTimeout(t);
  }, [clamped, delay, animate]);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rendered / 100) * circumference;
  const labelId = useId();

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
      }}
      role="img"
      aria-label={ariaLabel ?? `${Math.round(clamped)}%`}
      aria-describedby={labelId}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor ?? trailColor ?? "rgba(127,127,127,0.18)"}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={thickness}
          strokeLinecap={rounded ? "round" : "butt"}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: `stroke-dashoffset ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        />
      </svg>
      {children !== undefined && (
        <div
          id={labelId}
          style={{
            position: "absolute",
            // Keep content inside the ring stroke
            inset: thickness + 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1.05,
            pointerEvents: "none",
            textAlign: "center",
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

type DualRadialProgressProps = {
  inner: { value: number; color: string };
  outer: { value: number; color: string };
  size?: number;
  thickness?: number;
  gap?: number;
  trackColor?: string;
  className?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
  delay?: number;
  duration?: number;
  animate?: boolean;
};

export function DualRadialProgress({
  inner,
  outer,
  size = 140,
  thickness = 8,
  gap = 4,
  trackColor = "rgba(127,127,127,0.16)",
  className,
  children,
  ariaLabel,
  delay = 0,
  duration = 1000,
  animate = true,
}: DualRadialProgressProps) {
  const outerClamped = Math.max(0, Math.min(100, isFinite(outer.value) ? outer.value : 0));
  const innerClamped = Math.max(0, Math.min(100, isFinite(inner.value) ? inner.value : 0));

  const [outerR, setOuterR] = useState(animate ? 0 : outerClamped);
  const [innerR, setInnerR] = useState(animate ? 0 : innerClamped);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (!animate || reduced) {
      setOuterR(outerClamped);
      setInnerR(innerClamped);
      return;
    }
    const t1 = setTimeout(() => setOuterR(outerClamped), delay);
    // Inner ring follows outer with a 120ms lead — creates a pleasant cascade
    const t2 = setTimeout(() => setInnerR(innerClamped), delay + 120);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [outerClamped, innerClamped, delay, animate]);

  const outerRadius = (size - thickness) / 2;
  const innerRadius = outerRadius - thickness - gap;
  const outerC = 2 * Math.PI * outerRadius;
  const innerC = 2 * Math.PI * innerRadius;
  const outerOff = outerC - (outerR / 100) * outerC;
  const innerOff = innerC - (innerR / 100) * innerC;

  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
      }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer track + fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={outerRadius}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={outerRadius}
          fill="none"
          stroke={outer.color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={outerC}
          strokeDashoffset={outerOff}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: `stroke-dashoffset ${duration}ms ${easing}` }}
        />
        {/* Inner track + fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          fill="none"
          stroke={inner.color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={innerC}
          strokeDashoffset={innerOff}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: `stroke-dashoffset ${duration}ms ${easing}` }}
        />
      </svg>
      {children !== undefined && (
        <div
          style={{
            // Keep inner content inside the innermost ring stroke so text never
            // crosses/overlaps the rings. Padding is computed from actual ring
            // geometry (thickness * 2 for stroke on each side + gap).
            position: "absolute",
            inset: thickness * 2 + gap + 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 1,
            lineHeight: 1.05,
            pointerEvents: "none",
            textAlign: "center",
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
