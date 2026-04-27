"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
} from "@/components/motion/motion";
import { cn } from "@/lib/utils";

interface NumberTickerProps {
  value: number;
  decimals?: number;
  minIntegerDigits?: number;
  fontSize?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  stiffness?: number;
  damping?: number;
}

export function NumberTicker({
  value,
  decimals = 0,
  minIntegerDigits,
  fontSize,
  className,
  prefix,
  suffix,
  // Tuned 2026-04-27: longer count-up + softer digit-roll spring for a
  // "slot-machine settling" feel instead of a quick flick.
  duration = 2.2,
  delay = 0,
  stiffness = 70,
  damping = 22,
}: NumberTickerProps) {
  const reduce = useReducedMotion();
  const [displayed, setDisplayed] = useState(0);
  const [mounted, setMounted] = useState(false);
  const motionValue = useMotionValue(0);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (reduce) {
      // Snap directly to final value when prefers-reduced-motion is on.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayed(value);
      setMounted(true);
      motionValue.set(value);
      prevValueRef.current = value;
      return;
    }
    const from = prevValueRef.current === value ? 0 : prevValueRef.current;
    motionValue.set(from);
    // Fade in the whole component slightly behind the count — gives the
    // numbers a "developing" feel as they roll up.
    const fadeTimer = setTimeout(() => setMounted(true), Math.max(0, delay * 1000 - 50));
    const controls = animate(motionValue, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplayed(latest),
    });
    prevValueRef.current = value;
    return () => {
      controls.stop();
      clearTimeout(fadeTimer);
    };
  }, [value, duration, delay, motionValue, reduce]);

  const fixed = displayed.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const paddedInt = minIntegerDigits
    ? intPart.padStart(minIntegerDigits, "0")
    : intPart;

  if (reduce) {
    return (
      <span className={cn("tabular-nums", className)} style={fontSize ? { fontSize } : undefined}>
        {prefix}
        {paddedInt}
        {decimals > 0 ? `.${decPart}` : ""}
        {suffix}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-baseline tabular-nums", className)}
      aria-label={`${prefix ?? ""}${value.toFixed(decimals)}${suffix ?? ""}`}
      style={{
        ...(fontSize ? { fontSize } : {}),
        opacity: mounted ? 1 : 0.35,
        transform: mounted ? "translateY(0) scale(1)" : "translateY(4px) scale(0.96)",
        transition:
          "opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "inline-flex",
      }}
    >
      {prefix && <span>{prefix}</span>}
      {paddedInt.split("").map((digit, i) => (
        <Digit
          key={`int-${paddedInt.length - i}`}
          char={digit}
          stiffness={stiffness}
          damping={damping}
        />
      ))}
      {decimals > 0 && (
        <>
          <span>.</span>
          {decPart.split("").map((digit, i) => (
            <Digit
              key={`dec-${i}`}
              char={digit}
              stiffness={stiffness}
              damping={damping}
            />
          ))}
        </>
      )}
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

interface DigitProps {
  char: string;
  stiffness: number;
  damping: number;
}

function Digit({ char, stiffness, damping }: DigitProps) {
  const isDigit = /[0-9]/.test(char);
  const num = isDigit ? parseInt(char, 10) : 0;
  const motionValue = useMotionValue(num);
  const spring = useSpring(motionValue, { stiffness, damping });
  const y = useTransform(spring, (latest) => `${-latest}em`);

  useEffect(() => {
    motionValue.set(num);
  }, [num, motionValue]);

  if (!isDigit) return <span>{char}</span>;

  return (
    <span
      className="relative inline-block overflow-hidden align-baseline"
      style={{
        height: "1em",
        width: "0.6em",
        lineHeight: 1,
      }}
    >
      <motion.span
        className="absolute left-0 top-0 flex flex-col items-center"
        style={{ y }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className="block leading-none text-center"
            style={{ height: "1em", width: "0.6em" }}
          >
            {i}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
