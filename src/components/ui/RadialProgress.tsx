"use client";

import { useId } from "react";

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
}: RadialProgressProps) {
  const clamped = Math.max(0, Math.min(100, isFinite(value) ? value : 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
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
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      {children !== undefined && (
        <div
          id={labelId}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            pointerEvents: "none",
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
}: DualRadialProgressProps) {
  const outerR = (size - thickness) / 2;
  const innerR = outerR - thickness - gap;
  const outerC = 2 * Math.PI * outerR;
  const innerC = 2 * Math.PI * innerR;
  const outerOff = outerC - (Math.max(0, Math.min(100, outer.value)) / 100) * outerC;
  const innerOff = innerC - (Math.max(0, Math.min(100, inner.value)) / 100) * innerC;

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
          r={outerR}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={outerR}
          fill="none"
          stroke={outer.color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={outerC}
          strokeDashoffset={outerOff}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
        {/* Inner track + fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerR}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerR}
          fill="none"
          stroke={inner.color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={innerC}
          strokeDashoffset={innerOff}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
      </svg>
      {children !== undefined && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2,
            lineHeight: 1.1,
            pointerEvents: "none",
            textAlign: "center",
            padding: 8,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
