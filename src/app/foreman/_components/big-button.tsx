"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "default" | "huge";
  loading?: boolean;
}

const baseClasses =
  "w-full rounded-2xl font-semibold text-xl active:scale-[0.98] transition-transform duration-100 disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg select-none";

const variantClasses: Record<Variant, string> = {
  primary: "bg-emerald-500 hover:bg-emerald-400 text-white",
  secondary: "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700",
  danger: "bg-rose-600 hover:bg-rose-500 text-white",
  ghost: "bg-transparent hover:bg-zinc-800 text-zinc-200 shadow-none",
};

const sizeClasses: Record<"default" | "huge", string> = {
  default: "min-h-[72px] px-6 py-4",
  huge: "min-h-[120px] px-6 py-6 text-2xl",
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
      {loading && (
        <span
          className="inline-block h-6 w-6 rounded-full border-2 border-white border-t-transparent animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
});
