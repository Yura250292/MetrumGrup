import Link from "next/link";
import {
  AlertCircle,
  Wallet,
  FolderX,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";

type OverdueTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  project: { id: string; title: string };
};

type OverduePayment = {
  id: string;
  amount: unknown;
  scheduledDate: Date;
  project: { title: string };
};

type StaleProject = {
  id: string;
  title: string;
  updatedAt: Date;
  manager: { name: string | null } | null;
};

type DueTodayTask = {
  id: string;
  title: string;
  project: { id: string; title: string };
  status: { name: string; color: string };
};

export function NeedsAttention({
  overdueTasks,
  overduePayments,
  staleProjects,
  dueTodayTasks,
}: {
  overdueTasks: OverdueTask[];
  overduePayments: OverduePayment[];
  staleProjects: StaleProject[];
  dueTodayTasks: DueTodayTask[];
}) {
  const totalIssues =
    overdueTasks.length +
    overduePayments.length +
    staleProjects.length +
    dueTodayTasks.length;

  if (totalIssues === 0) return null;

  return (
    <section
      className="rounded-2xl p-6 overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        borderTop: `3px solid ${T.danger}`,
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.dangerSoft }}
          >
            <AlertCircle size={18} style={{ color: T.danger }} />
          </div>
          <div className="flex flex-col gap-0">
            <span
              className="text-[10px] font-bold tracking-wider"
              style={{ color: T.textMuted }}
            >
              ПОТРЕБУЄ УВАГИ
            </span>
            <h2
              className="text-base font-bold"
              style={{ color: T.textPrimary }}
            >
              Зони ризику
            </h2>
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {totalIssues}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {overdueTasks.length > 0 && (
          <RiskCard
            icon={AlertCircle}
            title="Прострочені задачі"
            severity="КРИТИЧНО"
            severityColor={T.danger}
            count={overdueTasks.length}
            items={overdueTasks.slice(0, 3).map((t) => ({
              label: t.title,
              sub: t.project.title,
            }))}
            href="/admin-v2/me"
            linkLabel="Переглянути задачі"
          />
        )}

        {overduePayments.length > 0 && (
          <RiskCard
            icon={Wallet}
            title="Прострочені платежі"
            severity="КРИТИЧНО"
            severityColor={T.danger}
            count={overduePayments.length}
            items={overduePayments.slice(0, 3).map((p) => ({
              label: p.project.title,
              sub: `${formatCurrency(Number(p.amount))} · ${formatDateShort(p.scheduledDate)}`,
            }))}
            href="/admin-v2/finance"
            linkLabel="Переглянути платежі"
          />
        )}

        {staleProjects.length > 0 && (
          <RiskCard
            icon={FolderX}
            title="Проєкти без руху"
            severity="УВАГА"
            severityColor={T.warning}
            count={staleProjects.length}
            items={staleProjects.slice(0, 3).map((p) => ({
              label: p.title,
              sub: `Оновлено ${formatDateShort(p.updatedAt)}${p.manager?.name ? ` · ${p.manager.name}` : ""}`,
            }))}
            href="/admin-v2/projects"
            linkLabel="Переглянути проєкти"
          />
        )}

        {dueTodayTasks.length > 0 && (
          <RiskCard
            icon={CalendarClock}
            title="Задачі на сьогодні"
            severity="ІНФО"
            severityColor={T.accentPrimary}
            count={dueTodayTasks.length}
            items={dueTodayTasks.slice(0, 3).map((t) => ({
              label: t.title,
              sub: t.project.title,
            }))}
            href="/admin-v2/me"
            linkLabel="Переглянути задачі"
          />
        )}
      </div>
    </section>
  );
}

function RiskCard({
  icon: Icon,
  title,
  severity,
  severityColor,
  count,
  items,
  href,
  linkLabel,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  severity: string;
  severityColor: string;
  count: number;
  items: { label: string; sub: string }[];
  href: string;
  linkLabel: string;
}) {
  return (
    <div
      className="flex flex-col rounded-xl p-4"
      style={{
        backgroundColor: T.panelElevated,
        borderLeft: `3px solid ${severityColor}`,
        border: `1px solid ${T.borderSoft}`,
        borderLeftWidth: 3,
        borderLeftColor: severityColor,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color: severityColor }} />
          <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            {title}
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider"
          style={{ backgroundColor: severityColor + "18", color: severityColor }}
        >
          {severity}
        </span>
      </div>

      {/* Count */}
      <div className="mb-3">
        <span className="text-2xl font-bold" style={{ color: severityColor }}>
          {count}
        </span>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1.5 mb-3 flex-1">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-0">
            <span
              className="text-[12px] font-semibold truncate"
              style={{ color: T.textPrimary }}
            >
              {item.label}
            </span>
            <span
              className="text-[10px] truncate"
              style={{ color: T.textMuted }}
            >
              {item.sub}
            </span>
          </div>
        ))}
      </div>

      {/* Link */}
      <Link
        href={href}
        className="flex items-center gap-1.5 text-[11px] font-semibold transition hover:brightness-[0.97]"
        style={{ color: severityColor }}
      >
        {linkLabel} <ArrowRight size={12} />
      </Link>
    </div>
  );
}
