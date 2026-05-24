"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  User,
  ArrowRight,
  AlertTriangle,
  Circle,
  Sparkles,
  Trash2,
  Check,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ExternalAssigneeChip } from "./external-assignee-chip";
import { isOverdue, PRIORITY_COLOR, type TaskItem } from "./use-me-tasks";

type Props = {
  task: TaskItem;
  currentUserId?: string;
  isTimerActive: boolean;
  pending: boolean;
  /**
   * Чи відображати кнопку видалення. Передається з parent'а, який знає роль
   * користувача — true для SUPER_ADMIN ИЛИ коли task.createdById === currentUserId.
   */
  canDelete?: boolean;
  onOpen: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onMarkDone: () => void;
  onDelete?: () => void;
  /** Викликається коли користувач натискає «Прийняти» (status «Новий»). */
  onAccept?: () => void;
};

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max).trim() + "…" : s;
}

/** "за 2 дні" / "сьогодні" / "прострочено 3 д" / "—" — компактна релативка. */
function formatDueRelative(
  dueIso: string | null,
  isDone: boolean,
): { label: string; tone: "danger" | "warn" | "muted" } {
  if (!dueIso) return { label: "—", tone: "muted" };
  const now = new Date();
  const due = new Date(dueIso);
  // Truncate to day for stable comparison.
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const diffDays = Math.round((b - a) / (24 * 60 * 60 * 1000));
  if (isDone) return { label: "виконано", tone: "muted" };
  if (diffDays < 0) {
    const d = Math.abs(diffDays);
    return { label: `прострочено ${d}д`, tone: "danger" };
  }
  if (diffDays === 0) return { label: "сьогодні", tone: "warn" };
  if (diffDays === 1) return { label: "завтра", tone: "warn" };
  if (diffDays <= 7) return { label: `за ${diffDays}д`, tone: "muted" };
  return {
    label: due.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
    tone: "muted",
  };
}

/**
 * Кольоровий маркер «скільки часу лишилось до дедлайну».
 *  🟢 >50% (багато часу) · 🟡 25-50% · 🔴 <25% · ⚫ прострочено · ⚪ done
 */
function deadlineDotColor(
  dueIso: string | null,
  createdAtIso: string | undefined,
  isDone: boolean,
): string | null {
  if (!dueIso || isDone) return null;
  const due = new Date(dueIso).getTime();
  // Якщо createdAt не передали — fallback на «дедлайн мінус 7 днів».
  const created = createdAtIso
    ? new Date(createdAtIso).getTime()
    : due - 7 * 24 * 3600 * 1000;
  const now = Date.now();
  if (now > due) return "#000000";
  const total = Math.max(due - created, 1);
  const remaining = due - now;
  const pct = (remaining / total) * 100;
  if (pct >= 50) return "#10b981"; // green
  if (pct >= 25) return "#f59e0b"; // yellow
  return "#ef4444"; // red
}

export function TaskRowExtended({
  task,
  currentUserId,
  isTimerActive,
  pending,
  canDelete = false,
  onOpen,
  // onStartTimer/onStopTimer — лишено у props для зворотньої сумісності
  // з усіма викликами; кнопка таймера у row прихована (виноситься у drawer).
  onStartTimer: _onStartTimer,
  onStopTimer: _onStopTimer,
  onMarkDone,
  onDelete,
  onAccept,
}: Props) {
  // Чи може поточний юзер прийняти задачу: у статусі «Новий» І він серед
  // assignees як User (не зовнішній).
  const isMyToAccept =
    !!currentUserId &&
    task.status.name === "Новий" &&
    (task.assignees ?? []).some((a) => a.user?.id === currentUserId);
  void _onStartTimer;
  void _onStopTimer;
  const overdue = isOverdue(task);

  // Inline-confirm на видалення: 1й клік підсвічує і чекає 3с. Другий клік
  // протягом 3с — реально видаляє. Поза цим вікном — reset. Так нема
  // міскліків + не залежимо від system confirm().
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      confirmTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmingDelete(false);
    onDelete();
  };
  const incoming = task.incomingDepsCount ?? 0;
  const outgoing = task.outgoingDepsCount ?? 0;
  const nextStep = task.firstUndoneChecklistItem;
  const showCreator =
    task.createdById && task.createdById !== currentUserId;
  const creatorName = showCreator ? task.createdBy?.name : undefined;
  const isUrgent = task.priority === "URGENT";
  const highlight = overdue || isUrgent;
  const due = formatDueRelative(task.dueDate, task.status.isDone);
  const dueColor =
    due.tone === "danger" ? T.danger : due.tone === "warn" ? T.warning : T.textMuted;
  const assignees = task.assignees ?? [];
  const visibleAssignees = assignees.slice(0, 3);
  const extraAssignees = assignees.length - visibleAssignees.length;

  return (
    <li
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:brightness-[0.98] cursor-pointer min-h-[52px]"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${highlight ? T.danger + "40" : T.borderSoft}`,
        borderLeft: highlight ? `3px solid ${T.danger}` : undefined,
        boxShadow: isTimerActive ? `inset 3px 0 0 ${T.accentPrimary}` : undefined,
      }}
      onClick={onOpen}
    >
      {/* Quick-complete circle: click to mark done without opening drawer. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!pending) onMarkDone();
        }}
        disabled={pending}
        className="flex-shrink-0 rounded-full p-0.5 hover:scale-110 transition disabled:opacity-50"
        title="Завершити"
        aria-label="Завершити задачу"
      >
        <Circle
          size={18}
          style={{ color: highlight ? T.danger : T.textMuted }}
        />
      </button>

      {/* Priority dot */}
      <span
        className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${highlight ? "animate-pulse" : ""}`}
        style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
        title={`Пріоритет: ${task.priority}${overdue ? " • прострочено" : ""}`}
      />

      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[13px] font-semibold truncate"
            style={{ color: T.textPrimary }}
          >
            {task.title}
          </span>
          {task.hasAiSpec && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{
                backgroundColor: T.accentSecondarySoft,
                color: T.accentSecondary,
              }}
              title="Технічне завдання згенеровано AI"
            >
              <Sparkles size={9} />
              ТЗ
            </span>
          )}
          {task.isRecurring && (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textSecondary,
                border: `1px solid ${T.borderSoft}`,
              }}
              title="Шаблон повторюваної задачі. Наступні екземпляри спавняться автоматично за день до дедлайну."
            >
              🔁 ПОВТОР
            </span>
          )}
          {task.recurrenceParentId && (
            <span
              className="text-[9px]"
              style={{ color: T.textMuted }}
              title="Екземпляр повторюваної задачі"
            >
              🔁
            </span>
          )}
          {incoming > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: T.warningSoft, color: T.warning }}
              title={`Блокують ${incoming} задач`}
            >
              <AlertTriangle size={9} />
              Блок: {incoming}
            </span>
          )}
          {outgoing > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
              title={`Блокує ${outgoing} задач`}
            >
              <ArrowRight size={9} />
              Блокує: {outgoing}
            </span>
          )}
        </div>

        <div
          className="flex items-center gap-2 text-[11px] flex-wrap"
          style={{ color: T.textMuted }}
        >
          {(() => {
            // Personal Inbox — це бакет, не «проєкт». Не показуємо лейбл.
            const isMyInbox =
              task.project.personalInboxUserId &&
              task.project.personalInboxUserId === currentUserId;
            if (isMyInbox) return null;
            return (
              <span className="truncate max-w-[180px]">{task.project.title}</span>
            );
          })()}
          {creatorName && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <User size={10} />
                {creatorName}
              </span>
            </>
          )}
          <span>·</span>
          {(() => {
            const dot = deadlineDotColor(
              task.dueDate,
              task.createdAt,
              task.status.isDone,
            );
            return (
              <span className="inline-flex items-center gap-1">
                {dot && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: dot }}
                    title="Маркер часу до дедлайну"
                  />
                )}
                <span className="font-medium" style={{ color: dueColor }}>
                  {due.label}
                </span>
              </span>
            );
          })()}
        </div>

        {nextStep && (
          <div
            className="flex items-center gap-1.5 text-[11px] mt-0.5"
            style={{ color: T.textSecondary }}
          >
            <Circle size={10} style={{ color: T.accentPrimary }} />
            <span className="truncate">{truncate(nextStep, 80)}</span>
          </div>
        )}
      </div>

      {/* Assignee stack (avatars + external chips) */}
      {visibleAssignees.length > 0 && (
        <div
          className="flex -space-x-1.5 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {visibleAssignees.map((a) =>
            a.user ? (
              <UserAvatar
                key={a.id}
                src={a.user.avatar}
                name={a.user.name}
                userId={a.user.id}
                size={24}
              />
            ) : (
              <ExternalAssigneeChip key={a.id} name={a.externalName ?? ""} size={24} />
            ),
          )}
          {extraAssignees > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full h-6 w-6 text-[9px] font-bold"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textMuted,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              +{extraAssignees}
            </span>
          )}
        </div>
      )}

      {/* Швидкі дії: прийняти (для «Новий») / завершити / видалити з 2-step. */}
      <div
        className="flex items-center gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition"
        onClick={(e) => e.stopPropagation()}
      >
        {isMyToAccept && onAccept && (
          <button
            type="button"
            onClick={onAccept}
            disabled={pending}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold disabled:opacity-50"
            style={{
              backgroundColor: T.accentPrimary,
              color: "#fff",
            }}
            title="Прийняти задачу у роботу"
            aria-label="Прийняти"
          >
            <Check size={12} />
            Прийняти
          </button>
        )}
        <button
          type="button"
          onClick={onMarkDone}
          disabled={pending}
          className="rounded-md p-1.5 disabled:opacity-50 hidden sm:inline-flex"
          style={{ backgroundColor: T.successSoft, color: T.success }}
          title="Завершити"
          aria-label="Завершити"
        >
          <CheckCircle2 size={12} />
        </button>
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={pending}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 disabled:opacity-50 transition"
            style={{
              backgroundColor: confirmingDelete ? T.danger : T.dangerSoft,
              color: confirmingDelete ? "#fff" : T.danger,
            }}
            title={confirmingDelete ? "Натисніть ще раз щоб видалити" : "Видалити задачу"}
            aria-label="Видалити задачу"
          >
            <Trash2 size={12} />
            {confirmingDelete && (
              <span className="text-[10px] font-bold">Точно?</span>
            )}
          </button>
        )}
      </div>
    </li>
  );
}
