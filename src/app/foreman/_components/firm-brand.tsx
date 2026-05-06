"use client";

import { motion } from "framer-motion";

export type FirmBrandKey = "metrum-group" | "metrum-studio" | "default";

interface FirmBrandConfig {
  name: string;
  shortName: string;
  /** Tailwind gradient classes (text/bg). */
  gradientText: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  /** Glow color (rgba) for ambient backdrop. */
  glow: string;
  /** Accent color for CTAs (Tailwind class). */
  accent: string;
  accentBg: string;
  accentBorder: string;
}

export const FIRM_BRANDS: Record<FirmBrandKey, FirmBrandConfig> = {
  "metrum-group": {
    name: "METRUM Group",
    shortName: "Group",
    gradientText: "from-sky-300 via-indigo-300 to-violet-400",
    gradientFrom: "from-sky-500/20",
    gradientVia: "via-indigo-500/10",
    gradientTo: "to-transparent",
    glow: "rgba(59, 91, 255, 0.35)",
    accent: "text-indigo-300",
    accentBg: "bg-indigo-500",
    accentBorder: "border-indigo-500/40",
  },
  "metrum-studio": {
    name: "METRUM Studio",
    shortName: "Studio",
    gradientText: "from-amber-200 via-amber-300 to-orange-400",
    gradientFrom: "from-amber-500/25",
    gradientVia: "via-orange-500/10",
    gradientTo: "to-transparent",
    glow: "rgba(245, 166, 35, 0.40)",
    accent: "text-amber-300",
    accentBg: "bg-amber-500",
    accentBorder: "border-amber-500/40",
  },
  default: {
    name: "METRUM",
    shortName: "Metrum",
    gradientText: "from-emerald-300 via-teal-300 to-emerald-400",
    gradientFrom: "from-emerald-500/15",
    gradientVia: "via-teal-500/8",
    gradientTo: "to-transparent",
    glow: "rgba(16, 185, 129, 0.30)",
    accent: "text-emerald-300",
    accentBg: "bg-emerald-500",
    accentBorder: "border-emerald-500/40",
  },
};

export function resolveFirmBrand(firmId: string | null | undefined): FirmBrandConfig {
  if (firmId && firmId in FIRM_BRANDS) {
    return FIRM_BRANDS[firmId as FirmBrandKey];
  }
  return FIRM_BRANDS["default"];
}

interface AmbientBackdropProps {
  brand: FirmBrandConfig;
}

/**
 * Subtle radial gradient backdrop that subconsciously communicates firm identity.
 * Fixed at top of viewport, animates in on mount.
 */
export function AmbientBackdrop({ brand }: AmbientBackdropProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[60vh]"
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${brand.glow} 0%, transparent 70%)`,
        }}
      />
    </motion.div>
  );
}

interface FirmLogoProps {
  brand: FirmBrandConfig;
  size?: "sm" | "md" | "lg";
}

/**
 * "METRUM Group" / "METRUM Studio" — typographic logo з градієнтним текстом.
 * Heavy letter-spacing + thin secondary slug = premium editorial feel.
 */
export function FirmLogo({ brand, size = "md" }: FirmLogoProps) {
  const sizeMap = {
    sm: { primary: "text-xs", secondary: "text-[9px]" },
    md: { primary: "text-sm", secondary: "text-[10px]" },
    lg: { primary: "text-2xl", secondary: "text-xs" },
  };
  const cls = sizeMap[size];
  const [first, ...rest] = brand.name.split(" ");
  const second = rest.join(" ");

  return (
    <div className="flex items-baseline gap-1.5 select-none">
      <span
        className={`${cls.primary} font-black tracking-[0.2em] text-white`}
        style={{ fontVariationSettings: "'wght' 900" }}
      >
        {first}
      </span>
      {second && (
        <span
          className={`${cls.secondary} font-light tracking-[0.3em] uppercase bg-clip-text text-transparent bg-gradient-to-r ${brand.gradientText}`}
        >
          {second}
        </span>
      )}
    </div>
  );
}
