import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  description?: string;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("p-3 md:p-5 hover:shadow-md transition-shadow", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-0.5 md:space-y-1 min-w-0 flex-1">
          <p className="text-[9px] md:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
            {title}
          </p>
          <p className="text-base md:text-2xl font-bold tracking-tight truncate">{value}</p>
          {description && (
            <p className="text-[9px] md:text-[11px] text-muted-foreground truncate">{description}</p>
          )}
        </div>
        <div className={cn("hidden md:flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </Card>
  );
}
