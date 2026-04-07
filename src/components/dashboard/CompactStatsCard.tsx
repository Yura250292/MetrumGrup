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
    blue: "admin-dark:bg-mesh-blue admin-dark:shadow-neon-blue admin-light:bg-gradient-to-br admin-light:from-blue-50 admin-light:to-blue-100 admin-light:border admin-light:border-blue-200 admin-light:shadow-lg",
    green: "admin-dark:bg-mesh-green admin-dark:shadow-neon-green admin-light:bg-gradient-to-br admin-light:from-green-50 admin-light:to-green-100 admin-light:border admin-light:border-green-200 admin-light:shadow-lg",
    gray: "admin-dark:bg-glass-dark admin-dark:border-white/20 admin-light:bg-gradient-to-br admin-light:from-gray-50 admin-light:to-gray-100 admin-light:border admin-light:border-gray-200 admin-light:shadow-lg",
  };

  const iconVariants = {
    blue: "admin-dark:bg-green-500 admin-dark:shadow-neon-green admin-light:bg-gradient-to-br admin-light:from-blue-500 admin-light:to-blue-600 admin-light:shadow-lg admin-light:shadow-blue-300/50",
    green: "admin-dark:bg-blue-500 admin-dark:shadow-neon-blue admin-light:bg-gradient-to-br admin-light:from-green-500 admin-light:to-green-600 admin-light:shadow-lg admin-light:shadow-green-300/50",
    gray: "admin-dark:bg-gradient-to-br admin-dark:from-amber-400 admin-dark:via-amber-500 admin-dark:to-amber-600 admin-dark:shadow-neon-amber admin-light:bg-gradient-to-br admin-light:from-gray-500 admin-light:to-gray-600 admin-light:shadow-lg admin-light:shadow-gray-300/50",
  };

  const textVariants = {
    blue: "admin-dark:text-blue-100 admin-light:text-blue-700",
    green: "admin-dark:text-emerald-100 admin-light:text-green-700",
    gray: "admin-dark:text-gray-200 admin-light:text-gray-700",
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
        <p className="text-2xl font-bold admin-dark:text-white admin-light:text-gray-900 tracking-tight">
          {value}
        </p>

        {/* Title - centered */}
        <p className={cn("text-xs font-semibold", textVariants[variant])}>
          {title}
        </p>

        {/* Optional Description - centered */}
        {description && (
          <p className="text-[11px] admin-dark:text-gray-300 admin-light:text-gray-600 leading-tight">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
