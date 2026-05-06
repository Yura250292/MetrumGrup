"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "default" | "huge";
  loading?: boolean;
}

const baseClasses =
  "relative w-full rounded-2xl font-semibold text-xl active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3 select-none overflow-hidden cursor-pointer";

const variantClasses: Record<Variant, string> = {
  // Premium gradient w/ inner gloss + ambient glow
  primary:
    "bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white shadow-[0_10px_40px_-12px_rgba(16,185,129,0.6),inset_0_1px_0_rgba(255,255,255,0.25)]",
  secondary:
    "bg-white/[0.04] text-white border border-white/10 backdrop-blur-md shadow-[0_4px_20px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]",
  danger:
    "bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-[0_10px_30px_-10px_rgba(244,63,94,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]",
  ghost: "bg-transparent text-zinc-300 hover:bg-white/5 shadow-none",
};

const sizeClasses: Record<"default" | "huge", string> = {
  default: "min-h-[64px] px-6 py-4",
  huge: "min-h-[96px] px-6 py-6 text-2xl",
};

export const BigButton = forwardRef<HTMLButtonElement, BigButtonProps>(function BigButton(
  { className = "", variant = "primary", size = "default", loading, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {/* top gloss highlight — premium feel */}
      {variant !== "ghost" && (
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/15 to-transparent"
          aria-hidden
        />
      )}

      <span className="relative flex items-center justify-center gap-3">
        {loading && (
          <span
            className="inline-block h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin"
            aria-hidden
          />
        )}
        {children}
      </span>
    </button>
  );
});
