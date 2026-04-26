"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  size?: "sm" | "md";
}

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { checked, onCheckedChange, size = "md", disabled, className, ...rest },
    ref,
  ) => {
    const dims =
      size === "sm"
        ? { track: "h-4 w-7", thumb: "h-3 w-3", on: "translate-x-3" }
        : { track: "h-5 w-9", thumb: "h-4 w-4", on: "translate-x-4" };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-t-border transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-t-bg",
          "disabled:cursor-not-allowed disabled:opacity-50",
          dims.track,
          checked ? "bg-primary" : "bg-t-panel-el",
          className,
        )}
        {...rest}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block translate-x-0.5 transform rounded-full bg-white shadow-sm transition-transform duration-200",
            dims.thumb,
            checked && dims.on,
          )}
        />
      </button>
    );
  },
);

Switch.displayName = "Switch";

export { Switch };
