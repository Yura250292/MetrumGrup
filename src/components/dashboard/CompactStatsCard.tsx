import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompactStatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  variant?: "blue" | "green" | "gray";
  className?: string;
}

export function CompactStatsCard({
  title,
  value,
  icon: Icon,
  variant = "blue",
  className,
}: CompactStatsCardProps) {
  const variants = {
    blue: "bg-mesh-blue shadow-neon-blue",
    green: "bg-mesh-green shadow-neon-green",
    gray: "bg-glass-dark border-white/20",
  };

  const iconVariants = {
    blue: "bg-green-500 shadow-neon-green",
    green: "bg-blue-500 shadow-neon-blue",
    gray: "bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 shadow-neon-amber",
  };

  const textVariants = {
    blue: "text-blue-100",
    green: "text-emerald-100",
    gray: "text-gray-200",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl p-3 backdrop-blur-sm hover-scale tap-scale transition-smooth animate-slide-in",
        variants[variant],
        className
      )}
    >
      {/* Inner shadow for depth */}
      <div className="absolute inset-0 rounded-xl shadow-inner-glass pointer-events-none" />

      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className="absolute inset-0 animate-shimmer" />
      </div>

      <div className="relative space-y-2">
        {/* Icon with neon glow */}
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg shadow-lg hover-lift animate-float",
            iconVariants[variant]
          )}
        >
          <Icon className="h-[18px] w-[18px] text-white transition-transform duration-300 group-hover:scale-110" />
        </div>

        {/* Value */}
        <p className="text-2xl font-bold text-white tracking-tight">
          {value}
        </p>

        {/* Title */}
        <p className={cn("text-[11px] font-medium", textVariants[variant])}>
          {title}
        </p>
      </div>
    </div>
  );
}
