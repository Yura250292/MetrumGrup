import Link from "next/link";
import {
  CheckCircle2,
  FolderKanban,
  ListTodo,
  Plus,
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
        className="premium-card rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div
          className="text-[10.5px] font-semibold uppercase mb-2.5"
          style={{ color: T.textMuted, letterSpacing: "0.08em" }}
        >
          Швидкі дії
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/admin-v2/projects/new"
            className="flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold transition hover:brightness-[0.97]"
            style={{
              background: `linear-gradient(135deg, ${T.accentPrimary}, #1e40af)`,
              color: "#fff",
              boxShadow: "0 1px 2px rgba(59,91,255,0.30), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <Plus size={14} />
            <span className="leading-tight">Новий проєкт</span>
          </Link>
          <Link
            href="/admin-v2/me"
            className="flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold transition hover:bg-[var(--t-panel-soft)]"
            style={{
              backgroundColor: T.panelSoft,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <ListTodo size={14} style={{ color: T.teal }} />
            <span className="leading-tight">Мої задачі</span>
          </Link>
        </div>
      </div>

      {/* Project Deadlines */}
      {projectDeadlines.length > 0 && (
        <div
          className="premium-card rounded-2xl overflow-hidden"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="section-head" style={{ padding: "12px 16px" }}>
            <h2>Дедлайни проєктів</h2>
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: T.warningSoft, color: T.warning }}
            >
              {projectDeadlines.length}
            </span>
          </div>
          <ul>
            {projectDeadlines.map((p, i) => (
              <li key={p.id}>
                <Link
                  href={`/admin-v2/projects/${p.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--t-panel-soft)]"
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                  }}
                >
                  <span className="status-dot warn" />
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate text-[12.5px] font-medium"
                      style={{ color: T.textPrimary }}
                    >
                      {p.title}
                    </div>
                  </div>
                  <span
                    className="text-[11px] font-medium tabular-nums whitespace-nowrap"
                    style={{ color: T.warning }}
                  >
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
        className="premium-card rounded-2xl overflow-hidden"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="section-head" style={{ padding: "12px 16px" }}>
          <h2>Прострочені платежі</h2>
          {overduePayments.length > 0 && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            >
              {overduePayments.length}
            </span>
          )}
        </div>
        {overduePayments.length === 0 ? (
          <div
            className="flex items-center gap-2 m-4 rounded-lg p-3"
            style={{ backgroundColor: T.successSoft }}
          >
            <CheckCircle2 size={14} style={{ color: T.success }} />
            <span
              className="text-[11.5px] font-semibold"
              style={{ color: T.success }}
            >
              Всі платежі вчасно
            </span>
          </div>
        ) : (
          <ul>
            {overduePayments.map((payment, i) => (
              <li
                key={payment.id}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{
                  borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                }}
              >
                <span className="status-dot danger" />
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate text-[12.5px] font-medium"
                    style={{ color: T.textPrimary }}
                  >
                    {payment.project.title}
                  </div>
                  <div
                    className="text-[11px]"
                    style={{ color: T.textMuted, marginTop: 1 }}
                  >
                    {formatDateShort(payment.scheduledDate)}
                  </div>
                </div>
                <span
                  className="text-[11.5px] font-semibold flex-shrink-0 tabular-nums whitespace-nowrap"
                  style={{ color: T.danger }}
                >
                  {formatCurrency(Number(payment.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Upcoming Tasks */}
      <div
        className="premium-card rounded-2xl overflow-hidden"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="section-head" style={{ padding: "12px 16px" }}>
          <h2>Найближчі задачі</h2>
          <span className="sub ml-auto">7 днів</span>
        </div>
        {upcomingTasks.length === 0 ? (
          <p
            className="text-[11.5px] px-4 py-4"
            style={{ color: T.textMuted }}
          >
            Немає запланованих задач
          </p>
        ) : (
          <ul>
            {upcomingTasks.map((t, i) => (
              <li key={t.id}>
                <Link
                  href={`/admin-v2/projects/${t.project.id}?tab=tasks`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--t-panel-soft)]"
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: t.status.color,
                      boxShadow: `0 0 0 3px ${t.status.color}26`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate text-[12.5px] font-medium"
                      style={{ color: T.textPrimary }}
                    >
                      {t.title}
                    </div>
                    <div
                      className="text-[11px] truncate"
                      style={{ color: T.textMuted, marginTop: 1 }}
                    >
                      {t.project.title}
                    </div>
                  </div>
                  <span
                    className="text-[11px] font-medium flex-shrink-0 tabular-nums whitespace-nowrap"
                    style={{ color: T.textMuted }}
                  >
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
