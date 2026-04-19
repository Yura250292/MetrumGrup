import {
  FolderKanban,
  AlertCircle,
  Wallet,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Доброго ранку, ${firstName}`;
  if (hour >= 12 && hour < 18) return `Добрий день, ${firstName}`;
  if (hour >= 18 && hour < 23) return `Добрий вечір, ${firstName}`;
  return `Доброї ночі, ${firstName}`;
}

function getRoleSubtitle(
  role: string,
  overdueTasksCount: number,
  overduePaymentsCount: number,
  activeProjectsCount: number,
  dueTodayCount: number,
): string {
  switch (role) {
    case "FINANCIER":
      return overduePaymentsCount > 0
        ? `Є ${overduePaymentsCount} прострочених платежів — потребують уваги`
        : "Фінансовий стан стабільний";
    case "ENGINEER":
      return dueTodayCount > 0
        ? `У вас ${dueTodayCount} задач на сьогодні`
        : overdueTasksCount > 0
          ? `${overdueTasksCount} прострочених задач потребують уваги`
          : "Всі задачі в нормі";
    case "MANAGER":
      if (overdueTasksCount > 0 || overduePaymentsCount > 0) {
        const parts = [];
        if (overdueTasksCount > 0) parts.push(`${overdueTasksCount} прострочених задач`);
        if (overduePaymentsCount > 0) parts.push(`${overduePaymentsCount} прострочених платежів`);
        return parts.join(", ");
      }
      return `${activeProjectsCount} активних проєктів під контролем`;
    default: // SUPER_ADMIN
      return "Огляд показників компанії на сьогодні";
  }
}

export function HeroBlock({
  firstName,
  today,
  activeProjectsCount,
  overdueTasksCount,
  overduePaymentsCount,
  netProfit,
  role = "SUPER_ADMIN",
  dueTodayCount = 0,
}: {
  firstName: string;
  today: string;
  activeProjectsCount: number;
  overdueTasksCount: number;
  overduePaymentsCount: number;
  netProfit: number;
  role?: string;
  dueTodayCount?: number;
}) {
  const attentionZones = [
    overdueTasksCount > 0,
    overduePaymentsCount > 0,
    netProfit < 0,
  ].filter(Boolean).length;

  const isStable = attentionZones === 0;
  const greeting = getGreeting(firstName);
  const subtitle = getRoleSubtitle(role, overdueTasksCount, overduePaymentsCount, activeProjectsCount, dueTodayCount);

  return (
    <section
      className="rounded-xl sm:rounded-2xl p-4 sm:p-8 relative overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        borderLeft: `4px solid ${isStable ? T.success : attentionZones >= 2 ? T.danger : T.warning}`,
      }}
    >
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Date + greeting */}
        <div className="flex flex-col gap-0.5 sm:gap-1">
          <span
            className="text-[10px] sm:text-[11px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
            {today.toUpperCase()}
          </span>
          <h1
            className="text-xl sm:text-3xl md:text-4xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            {greeting}
          </h1>
          <p className="text-[13px] sm:text-[14px]" style={{ color: T.textSecondary }}>
            {subtitle}
          </p>
        </div>

        {/* Mini KPI chips */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <MiniChip
            icon={FolderKanban}
            label={`${activeProjectsCount} активних проєктів`}
            color={T.accentPrimary}
          />
          <MiniChip
            icon={AlertCircle}
            label={`${overdueTasksCount} прострочених задач`}
            color={overdueTasksCount > 0 ? T.danger : T.success}
            alert={overdueTasksCount > 0}
          />
          <MiniChip
            icon={Wallet}
            label={`${overduePaymentsCount} прострочених платежів`}
            color={overduePaymentsCount > 0 ? T.danger : T.success}
            alert={overduePaymentsCount > 0}
          />
          <MiniChip
            icon={netProfit >= 0 ? TrendingUp : TrendingDown}
            label={`${formatCurrencyCompact(netProfit)} чистий`}
            color={netProfit >= 0 ? T.success : T.danger}
            alert={netProfit < 0}
          />
        </div>

        {/* Status line */}
        <div className="flex items-center gap-2">
          {isStable ? (
            <>
              <CheckCircle2 size={16} style={{ color: T.success }} />
              <span className="text-[13px] font-semibold" style={{ color: T.success }}>
                Сьогодні стабільний день
              </span>
            </>
          ) : (
            <>
              <ShieldAlert size={16} style={{ color: attentionZones >= 2 ? T.danger : T.warning }} />
              <span
                className="text-[13px] font-semibold"
                style={{ color: attentionZones >= 2 ? T.danger : T.warning }}
              >
                Є {attentionZones} {attentionZones === 1 ? "зона" : attentionZones < 5 ? "зони" : "зон"} уваги
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function MiniChip({
  icon: Icon,
  label,
  color,
  alert,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  color: string;
  alert?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{
        backgroundColor: color + "10",
        border: `1px solid ${color}${alert ? "30" : "18"}`,
      }}
    >
      <Icon size={14} style={{ color }} />
      <span className="text-[12px] sm:text-[13px] font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
