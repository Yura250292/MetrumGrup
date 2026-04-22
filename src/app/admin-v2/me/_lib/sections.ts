import type { TaskItem } from "../_components/use-me-tasks";

export type SectionKey =
  | "do-now"
  | "waiting-review"
  | "delegated"
  | "blocked-by"
  | "blocking-others"
  | "today"
  | "overdue";

export const SECTION_ORDER: SectionKey[] = [
  "do-now",
  "waiting-review",
  "delegated",
  "blocked-by",
  "blocking-others",
  "today",
  "overdue",
];

export const SECTION_LABEL: Record<SectionKey, string> = {
  "do-now": "Роби зараз",
  "waiting-review": "Чекає мого рішення",
  "delegated": "Делеговано",
  "blocked-by": "Мене блокують",
  "blocking-others": "Я блокую інших",
  "today": "На сьогодні",
  "overdue": "Прострочене",
};

export const SECTION_HINT: Record<SectionKey, string> = {
  "do-now": "Ти головний виконавець, нічого не чекає",
  "waiting-review": "Задачі з погодженням, рішенням, відповіддю",
  "delegated": "Поставлено іншим, чекає їх кроку",
  "blocked-by": "Блокуються чужими задачами",
  "blocking-others": "Тримають команду — зробити в першу чергу",
  "today": "Дедлайн — сьогодні",
  "overdue": "Дедлайн минув, потрібна реакція",
};

const REVIEW_STATUS_PATTERN =
  /погодж|на\s*перевірц|perev|review|waiting|approval|очіку/i;

const REVIEW_LABEL_PATTERN = /погодж|чека|рішен|review|approval|waiting/i;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function classifyTask(task: TaskItem, userId: string): Set<SectionKey> {
  const sections = new Set<SectionKey>();
  const isDone = task.status.isDone;
  const isAssignee = (task.assignees ?? []).some((a) => a.user.id === userId);
  const isWatcher = (task.watchers ?? []).some((w) => w.userId === userId);
  const isCreator = task.createdById === userId;
  const incoming = task.incomingDepsCount ?? 0;
  const outgoing = task.outgoingDepsCount ?? 0;

  if (isDone) return sections;

  if (isAssignee && incoming === 0) {
    sections.add("do-now");
  }

  if ((isWatcher || isCreator) && !isAssignee) {
    const statusMatch = REVIEW_STATUS_PATTERN.test(task.status.name ?? "");
    const labelMatch = (task.labels ?? []).some((l) =>
      REVIEW_LABEL_PATTERN.test(l.label.name ?? ""),
    );
    if (statusMatch || labelMatch) sections.add("waiting-review");
  }

  if (isCreator && !isAssignee && (task.assignees ?? []).length > 0) {
    sections.add("delegated");
  }

  if (isAssignee && incoming > 0) {
    sections.add("blocked-by");
  }

  if (isAssignee && outgoing > 0) {
    sections.add("blocking-others");
  }

  if (task.dueDate && isAssignee) {
    const due = new Date(task.dueDate);
    const now = new Date();
    if (isSameDay(due, now)) sections.add("today");
    else if (due < now) sections.add("overdue");
  }

  return sections;
}

export function groupBySection(
  tasks: TaskItem[],
  userId: string,
): Record<SectionKey, TaskItem[]> {
  const buckets: Record<SectionKey, TaskItem[]> = {
    "do-now": [],
    "waiting-review": [],
    "delegated": [],
    "blocked-by": [],
    "blocking-others": [],
    "today": [],
    "overdue": [],
  };
  for (const task of tasks) {
    const keys = classifyTask(task, userId);
    for (const key of keys) buckets[key].push(task);
  }
  return buckets;
}
