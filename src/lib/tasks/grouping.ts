/**
 * Чисті (Prisma-free) групування та побудова дерева підзадач для List/Table
 * представлень модуля задач. Тестується Jest у Node.
 */

export type GroupKey = "stage" | "status" | "assignee" | "priority" | "none";

/** Мінімальна форма задачі, потрібна для групування. */
export type GroupableTask = {
  id: string;
  parentTaskId: string | null;
  stageId: string;
  statusId: string;
  status: { name: string; color: string };
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  assignees: { user: { id: string; name: string } }[];
};

export type TaskGroup<T> = {
  /** Стабільний ключ групи (id статусу/етапу/виконавця/пріоритету). */
  key: string;
  label: string;
  /** Колір для пігулки (лише для групування за статусом). */
  color?: string;
  items: T[];
};

export type GroupingContext = {
  stages: { id: string; name: string }[];
  statuses: { id: string; name: string; color: string }[];
};

const PRIORITY_GROUP_ORDER: GroupableTask["priority"][] = [
  "URGENT",
  "HIGH",
  "NORMAL",
  "LOW",
];
const PRIORITY_GROUP_LABEL: Record<GroupableTask["priority"], string> = {
  URGENT: "Терміновий",
  HIGH: "Високий",
  NORMAL: "Звичайний",
  LOW: "Низький",
};

const UNASSIGNED_KEY = "__unassigned__";
const NO_STAGE_KEY = "__no_stage__";
const ALL_KEY = "__all__";

/**
 * Групує задачі за обраним ключем. Зберігає вхідний порядок усередині груп.
 * Очікує КОРЕНЕВІ задачі (підзадачі рендеряться вкладено під батьком окремо).
 *
 * Зауваження: для "assignee" задача з кількома виконавцями зʼявляється в кожній
 * групі (fan-out). Тому субсума витрат по групах assignee може подвоювати —
 * тотал проєкту рахувати з distinct-коренів, не сумою груп.
 */
export function groupTasks<T extends GroupableTask>(
  tasks: T[],
  by: GroupKey,
  ctx: GroupingContext,
): TaskGroup<T>[] {
  if (by === "none") {
    return [{ key: ALL_KEY, label: "Усі задачі", items: [...tasks] }];
  }

  if (by === "priority") {
    const buckets = new Map<string, T[]>();
    for (const t of tasks) {
      const arr = buckets.get(t.priority) ?? [];
      arr.push(t);
      buckets.set(t.priority, arr);
    }
    return PRIORITY_GROUP_ORDER.filter((p) => buckets.has(p)).map((p) => ({
      key: p,
      label: PRIORITY_GROUP_LABEL[p],
      items: buckets.get(p) ?? [],
    }));
  }

  if (by === "stage") {
    const buckets = new Map<string, T[]>();
    for (const t of tasks) {
      const k = t.stageId || NO_STAGE_KEY;
      const arr = buckets.get(k) ?? [];
      arr.push(t);
      buckets.set(k, arr);
    }
    const groups: TaskGroup<T>[] = [];
    for (const s of ctx.stages) {
      if (buckets.has(s.id)) {
        groups.push({ key: s.id, label: s.name, items: buckets.get(s.id) ?? [] });
        buckets.delete(s.id);
      }
    }
    // Залишки (невідомі/без етапу) — у кінець.
    if (buckets.size > 0) {
      const leftover: T[] = [];
      for (const arr of buckets.values()) leftover.push(...arr);
      groups.push({ key: NO_STAGE_KEY, label: "Без етапу", items: leftover });
    }
    return groups;
  }

  if (by === "status") {
    const buckets = new Map<string, T[]>();
    for (const t of tasks) {
      const arr = buckets.get(t.statusId) ?? [];
      arr.push(t);
      buckets.set(t.statusId, arr);
    }
    const groups: TaskGroup<T>[] = [];
    for (const s of ctx.statuses) {
      if (buckets.has(s.id)) {
        groups.push({ key: s.id, label: s.name, color: s.color, items: buckets.get(s.id) ?? [] });
        buckets.delete(s.id);
      }
    }
    // Статуси, відсутні в ctx — за порядком появи, колір беремо з задачі.
    for (const [statusId, arr] of buckets) {
      groups.push({ key: statusId, label: arr[0]?.status.name ?? "—", color: arr[0]?.status.color, items: arr });
    }
    return groups;
  }

  // assignee — fan-out
  const buckets = new Map<string, { label: string; items: T[] }>();
  const order: string[] = [];
  const ensure = (key: string, label: string) => {
    if (!buckets.has(key)) {
      buckets.set(key, { label, items: [] });
      order.push(key);
    }
    return buckets.get(key)!;
  };
  for (const t of tasks) {
    if (t.assignees.length === 0) {
      ensure(UNASSIGNED_KEY, "Без виконавця").items.push(t);
      continue;
    }
    for (const a of t.assignees) {
      ensure(a.user.id, a.user.name).items.push(t);
    }
  }
  // "Без виконавця" — у кінець.
  const sortedKeys = order.filter((k) => k !== UNASSIGNED_KEY);
  if (buckets.has(UNASSIGNED_KEY)) sortedKeys.push(UNASSIGNED_KEY);
  return sortedKeys.map((k) => ({ key: k, label: buckets.get(k)!.label, items: buckets.get(k)!.items }));
}

/** Вузол дерева задач із вкладеними дітьми та глибиною. */
export type TaskTreeNode<T> = {
  task: T;
  depth: number;
  children: TaskTreeNode<T>[];
};

/**
 * Будує дерево за parentTaskId. Корені — задачі без батька АБО з батьком,
 * відсутнім у наборі (осиротілі через фільтр/архів). Зберігає вхідний порядок.
 * Захист від циклів: вузол, уже доданий у дерево, повторно не вкладається.
 */
export function buildTaskTree<T extends { id: string; parentTaskId: string | null }>(
  tasks: T[],
): TaskTreeNode<T>[] {
  const byId = new Map<string, T>();
  for (const t of tasks) byId.set(t.id, t);

  const childrenByParent = new Map<string, T[]>();
  const roots: T[] = [];
  for (const t of tasks) {
    const parentId = t.parentTaskId;
    if (parentId && byId.has(parentId) && parentId !== t.id) {
      const arr = childrenByParent.get(parentId) ?? [];
      arr.push(t);
      childrenByParent.set(parentId, arr);
    } else {
      // без батька або осиротіла → корінь
      roots.push(t);
    }
  }

  const visited = new Set<string>();
  function build(t: T, depth: number): TaskTreeNode<T> {
    visited.add(t.id);
    const kids = (childrenByParent.get(t.id) ?? [])
      .filter((c) => !visited.has(c.id))
      .map((c) => build(c, depth + 1));
    return { task: t, depth, children: kids };
  }

  const result = roots.map((r) => build(r, 0));
  // Недосяжні вузли (взаємний цикл, де жоден не корінь) — промоутимо у корені,
  // щоб задачі не зникали з дерева.
  for (const tk of tasks) {
    if (!visited.has(tk.id)) result.push(build(tk, 0));
  }
  return result;
}

/** Плаский обхід дерева (для рендеру рядків у порядку з урахуванням expanded). */
export function flattenTree<T>(
  nodes: TaskTreeNode<T>[],
  isExpanded: (node: TaskTreeNode<T>) => boolean,
): TaskTreeNode<T>[] {
  const out: TaskTreeNode<T>[] = [];
  const walk = (list: TaskTreeNode<T>[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length > 0 && isExpanded(n)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
