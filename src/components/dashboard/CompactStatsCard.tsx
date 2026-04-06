import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompactStatsCardProps {
  title: string;
  value: string;
  description?: string;
  icon: LucideIcon;
  variant?: "blue" | "green" | "gray";
  className?: string;
}

export function CompactStatsCard({
  title,
  value,
  description,
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
        "relative overflow-hidden rounded-xl p-4 backdrop-blur-sm hover-scale tap-scale transition-smooth animate-slide-in",
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

      <div className="relative flex flex-col items-center text-center space-y-2">
        {/* Icon with neon glow - larger and centered */}
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl shadow-lg hover-lift animate-float",
            iconVariants[variant]
          )}
        >
          <Icon className="h-6 w-6 text-white transition-transform duration-300 group-hover:scale-110" />
        </div>

        {/* Value - centered */}
        <p className="text-2xl font-bold text-white tracking-tight">
          {value}
        </p>

        {/* Title - centered */}
        <p className={cn("text-xs font-semibold", textVariants[variant])}>
          {title}
        </p>

        {/* Optional Description - centered */}
        {description && (
          <p className="text-[11px] text-gray-300 leading-tight">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
