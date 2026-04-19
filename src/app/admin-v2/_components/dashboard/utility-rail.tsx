import Link from "next/link";
import {
  Plus,
  AlertCircle,
  Zap,
  CheckCircle2,
  Calendar,
  FolderKanban,
  ListTodo,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";

type OverduePayment = {
  id: string;
  amount: unknown;
  scheduledDate: Date;
  project: { id: string; title: string };
};

type UpcomingTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  project: { id: string; title: string };
  status: { name: string; color: string };
};

type ProjectDeadline = {
  id: string;
  title: string;
  expectedEndDate: Date;
};

export function UtilityRail({
  overduePayments,
  upcomingTasks,
  projectDeadlines,
}: {
  overduePayments: OverduePayment[];
  upcomingTasks: UpcomingTask[];
  projectDeadlines: ProjectDeadline[];
}) {
  return (
    <div className="flex flex-col gap-4 xl:sticky xl:top-4">
      {/* Quick Create */}
      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <h3
          className="text-[11px] font-bold tracking-wider mb-3"
          style={{ color: T.textMuted }}
        >
          ШВИДКІ ДІЇ
        </h3>
        <div className="flex flex-col gap-2">
          <Link
            href="/admin-v2/projects/new"
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition hover:brightness-[0.97]"
            style={{
              backgroundColor: T.accentPrimary + "10",
              color: T.accentPrimary,
              border: `1px solid ${T.accentPrimary}20`,
            }}
          >
            <FolderKanban size={14} />
            Новий проєкт
          </Link>
          <Link
            href="/admin-v2/me"
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition hover:brightness-[0.97]"
            style={{
              backgroundColor: T.teal + "10",
              color: T.teal,
              border: `1px solid ${T.teal}20`,
            }}
          >
            <ListTodo size={14} />
            Мої задачі
          </Link>
        </div>
      </div>

      {/* Project Deadlines */}
      {projectDeadlines.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ДЕДЛАЙНИ ПРОЄКТІВ
            </h3>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: T.warningSoft, color: T.warning }}
            >
              {projectDeadlines.length}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {projectDeadlines.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin-v2/projects/${p.id}`}
                  className="flex items-start gap-2 rounded-lg p-2.5 transition hover:brightness-[0.97]"
                  style={{
                    backgroundColor: T.panelElevated,
                    borderLeft: `3px solid ${T.warning}`,
                  }}
                >
                  <Calendar size={12} style={{ color: T.warning }} className="mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                      {p.title}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold flex-shrink-0" style={{ color: T.warning }}>
                    {formatDateShort(p.expectedEndDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Overdue Payments */}
      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ПРОСТРОЧЕНІ ПЛАТЕЖІ
          </h3>
          {overduePayments.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            >
              {overduePayments.length}
            </span>
          )}
        </div>
        {overduePayments.length === 0 ? (
          <div
            className="flex items-center gap-2 rounded-lg p-3"
            style={{ backgroundColor: T.successSoft }}
          >
            <CheckCircle2 size={14} style={{ color: T.success }} />
            <span className="text-[11px] font-semibold" style={{ color: T.success }}>
              Всі платежі вчасно
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {overduePayments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-start gap-2 rounded-lg p-2.5"
                style={{
                  backgroundColor: T.panelElevated,
                  borderLeft: `3px solid ${T.danger}`,
                }}
              >
                <AlertCircle size={12} style={{ color: T.danger }} className="mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                    {payment.project.title}
                  </div>
                  <div className="text-[10px]" style={{ color: T.textMuted }}>
                    {formatDateShort(payment.scheduledDate)}
                  </div>
                </div>
                <span className="text-[11px] font-bold flex-shrink-0" style={{ color: T.danger }}>
                  {formatCurrency(Number(payment.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Upcoming Tasks */}
      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            НАЙБЛИЖЧІ ЗАДАЧІ
          </h3>
          <span className="text-[10px]" style={{ color: T.textMuted }}>
            7 днів
          </span>
        </div>
        {upcomingTasks.length === 0 ? (
          <p className="text-[11px]" style={{ color: T.textMuted }}>
            Немає запланованих задач
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {upcomingTasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin-v2/projects/${t.project.id}?tab=tasks`}
                  className="flex items-start gap-2 rounded-lg p-2.5 transition hover:brightness-[0.97]"
                  style={{
                    backgroundColor: T.panelElevated,
                    borderLeft: `3px solid ${t.status.color}`,
                  }}
                >
                  <Zap size={12} style={{ color: t.status.color }} className="mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                      {t.title}
                    </div>
                    <div className="text-[10px] truncate" style={{ color: T.textMuted }}>
                      {t.project.title}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold flex-shrink-0" style={{ color: T.textMuted }}>
                    {t.dueDate ? formatDateShort(t.dueDate) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
