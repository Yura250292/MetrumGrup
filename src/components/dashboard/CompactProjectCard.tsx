import Link from "next/link";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompactProjectCardProps {
  id: string;
  title: string;
  address: string;
  status: "ACTIVE" | "IN_PROGRESS" | "COMPLETED";
  progress: number;
  variant?: "blue" | "amber";
}

export function CompactProjectCard({
  id,
  title,
  address,
  status,
  progress,
  variant = "blue",
}: CompactProjectCardProps) {
  const statusConfig = {
    ACTIVE: { label: "Активний", color: "bg-gradient-to-r from-green-500 to-emerald-400 shadow-neon-green" },
    IN_PROGRESS: { label: "В роботі", color: "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-neon-amber" },
    COMPLETED: { label: "Завершено", color: "bg-gradient-to-r from-blue-500 to-cyan-400 shadow-neon-blue" },
  };

  const borderVariant = variant === "blue" ? "border-blue-500/20" : "border-amber-500/20";
  const shadowVariant = variant === "blue" ? "shadow-neon-blue-soft" : "shadow-neon-amber-soft";

  return (
    <Link href={`/dashboard/projects/${id}`}>
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl bg-glass-dark backdrop-blur-md border p-3 hover-scale tap-scale transition-smooth animate-slide-in hover-glow",
          borderVariant,
          shadowVariant
        )}
      >
        {/* Background glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Shimmer on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 animate-shimmer" />
        </div>

        <div className="relative space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white truncate">
              {title}
            </h3>
            <span
              className={cn(
                "flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium text-white",
                statusConfig[status].color
              )}
            >
              {statusConfig[status].label}
            </span>
          </div>

          {/* Address */}
          <div className="flex items-center gap-1 text-gray-400">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="text-[10px] truncate">{address}</span>
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="h-1 w-full rounded-full bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-emerald-200">{progress}%</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
