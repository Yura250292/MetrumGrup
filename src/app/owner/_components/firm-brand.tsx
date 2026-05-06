"use client";

import { motion } from "framer-motion";

export type FirmBrandKey = "metrum-group" | "metrum-studio" | "all" | "default";

export interface FirmBrandConfig {
  name: string;
  shortName: string;
  gradientText: string;
  glow: string;
  accent: string;
  accentBg: string;
}

export const FIRM_BRANDS: Record<FirmBrandKey, FirmBrandConfig> = {
  "metrum-group": {
    name: "METRUM Group",
    shortName: "Group",
    gradientText: "from-sky-300 via-indigo-300 to-violet-400",
    glow: "rgba(59, 91, 255, 0.35)",
    accent: "text-indigo-300",
    accentBg: "bg-indigo-500",
  },
  "metrum-studio": {
    name: "METRUM Studio",
    shortName: "Studio",
    gradientText: "from-amber-200 via-amber-300 to-orange-400",
    glow: "rgba(245, 166, 35, 0.40)",
    accent: "text-amber-300",
    accentBg: "bg-amber-500",
  },
  all: {
    name: "METRUM Усі",
    shortName: "Усі",
    gradientText: "from-emerald-200 via-teal-300 to-cyan-300",
    glow: "rgba(16, 185, 129, 0.30)",
    accent: "text-emerald-300",
    accentBg: "bg-emerald-500",
  },
  default: {
    name: "METRUM",
    shortName: "Metrum",
    gradientText: "from-emerald-300 via-teal-300 to-emerald-400",
    glow: "rgba(16, 185, 129, 0.30)",
    accent: "text-emerald-300",
    accentBg: "bg-emerald-500",
  },
};

export function resolveOwnerBrand(firmId: string | null | undefined): FirmBrandConfig {
  if (firmId === null) return FIRM_BRANDS["all"];
  if (firmId && firmId in FIRM_BRANDS) {
    return FIRM_BRANDS[firmId as FirmBrandKey];
  }
  return FIRM_BRANDS["default"];
}

export function AmbientBackdrop({ brand }: { brand: FirmBrandConfig }) {
  return (
    <motion.div
      key={brand.name}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
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
      <span className={`${cls.primary} font-black tracking-[0.2em] text-white`}>{first}</span>
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
