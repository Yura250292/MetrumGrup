import Link from "next/link";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompactProjectCardProps {
  id: string;
  title: string;
  address: string;
  status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
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
    DRAFT: { label: "Чернетка", color: "bg-gradient-to-r from-gray-500 to-gray-400" },
    ACTIVE: { label: "Активний", color: "bg-gradient-to-r from-green-500 to-emerald-400 shadow-neon-green" },
    ON_HOLD: { label: "Призупинено", color: "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-neon-amber" },
    COMPLETED: { label: "Завершено", color: "bg-gradient-to-r from-blue-500 to-cyan-400 shadow-neon-blue" },
    CANCELLED: { label: "Скасовано", color: "bg-gradient-to-r from-red-500 to-rose-400" },
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

        <div className="relative space-y-2.5">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-white leading-tight line-clamp-2 flex-1 min-w-0">
              {title}
            </h3>
            <span
              className={cn(
                "flex-shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-white shadow-lg",
                statusConfig[status].color
              )}
            >
              {statusConfig[status].label}
            </span>
          </div>

          {/* Address */}
          <div className="flex items-center gap-1.5 text-gray-300">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs truncate">{address}</span>
          </div>

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-gray-700 overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500 shadow-neon-blue-soft"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs font-semibold text-emerald-300">Прогрес: {progress}%</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
