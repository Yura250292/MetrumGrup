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
          <p className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wide truncate">
            {title}
          </p>
          <p className="text-lg md:text-2xl font-bold tracking-tight truncate">{value}</p>
          {description && (
            <p className="text-xs md:text-sm text-muted-foreground truncate">{description}</p>
          )}
        </div>
        <div className={cn("flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg md:rounded-xl flex-shrink-0", iconBg)}>
          <Icon className={cn("h-4 w-4 md:h-5 md:w-5", iconColor)} />
        </div>
      </div>
    </Card>
  );
}
