import type { TaskItem } from "../_components/use-me-tasks";

/**
 * Секції для view «Пріоритети». Класифікація завдань по контексту, а не
 * по статусу — статуси тепер 3 (Новий/В роботі/Закрито) і не несуть
 * семантики «чекає рішення».
 */
export type SectionKey =
  | "do-now"
  | "delegated"
  | "blocked-by"
  | "blocking-others"
  | "today"
  | "overdue";

export const SECTION_ORDER: SectionKey[] = [
  "do-now",
  "delegated",
  "blocked-by",
  "blocking-others",
  "today",
  "overdue",
];

export const SECTION_LABEL: Record<SectionKey, string> = {
  "do-now": "Роби зараз",
  "delegated": "Делеговано",
  "blocked-by": "Мене блокують",
  "blocking-others": "Я блокую інших",
  "today": "На сьогодні",
  "overdue": "Прострочене",
};

export const SECTION_HINT: Record<SectionKey, string> = {
  "do-now": "Ти головний виконавець, нічого не чекає",
  "delegated": "Поставлено іншим, чекає їх кроку",
  "blocked-by": "Блокуються чужими задачами",
  "blocking-others": "Тримають команду — зробити в першу чергу",
  "today": "Дедлайн — сьогодні",
  "overdue": "Дедлайн минув, потрібна реакція",
};

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
  const isAssignee = (task.assignees ?? []).some((a) => a.user?.id === userId);
  const isCreator = task.createdById === userId;
  const incoming = task.incomingDepsCount ?? 0;
  const outgoing = task.outgoingDepsCount ?? 0;

  if (isDone) return sections;

  if (isAssignee && incoming === 0) {
    sections.add("do-now");
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

/**
 * Пріоритет секцій (зверху — найвища, тобто перемагає при дедупі).
 * Задача потрапляє у ПЕРШУ секцію зі списку, де вона матчиться,
 * а не у всі одразу. Інакше «синхронізація на сьогодні де я виконавець»
 * показувалась і в «Роби зараз», і в «На сьогодні».
 */
const SECTION_PRIORITY: SectionKey[] = [
  "overdue", // дедлайн минув — найкритичніше
  "today", // дедлайн сьогодні — друге за критичністю
  "blocked-by", // я чекаю чужу залежність
  "blocking-others", // я тримаю команду
  "delegated", // поставив іншим, чекаю
  "do-now", // дефолт: я виконавець без блокерів і термінів
];

export function groupBySection(
  tasks: TaskItem[],
  userId: string,
): Record<SectionKey, TaskItem[]> {
  const buckets: Record<SectionKey, TaskItem[]> = {
    "do-now": [],
    "delegated": [],
    "blocked-by": [],
    "blocking-others": [],
    "today": [],
    "overdue": [],
  };
  for (const task of tasks) {
    const keys = classifyTask(task, userId);
    if (keys.size === 0) continue;
    // ОДНА секція на задачу — за пріоритетом.
    const chosen = SECTION_PRIORITY.find((k) => keys.has(k));
    if (chosen) buckets[chosen].push(task);
  }
  return buckets;
}
