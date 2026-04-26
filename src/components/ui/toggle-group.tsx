"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface ToggleGroupOption<T extends string> {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
  icon?: React.ReactNode;
}

export interface ToggleGroupProps<T extends string> {
  value: T;
  onValueChange: (next: T) => void;
  options: ReadonlyArray<ToggleGroupOption<T>>;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}

export function ToggleGroup<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  size = "md",
  className,
}: ToggleGroupProps<T>) {
  const groupId = useId();
  const sizeClasses =
    size === "sm" ? "h-8 px-2.5 text-xs gap-1" : "h-9 px-3 text-sm gap-1.5";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-lg border border-t-border bg-t-panel-soft p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            id={`${groupId}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel ?? undefined}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "inline-flex select-none items-center justify-center rounded-md font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              sizeClasses,
              active
                ? "bg-t-panel text-t-1 shadow-sm"
                : "text-t-2 hover:text-t-1 hover:bg-t-panel/60",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
