/**
 * Чисті (Phaser/Prisma-free) обчислення витрат по задачах для ClickUp-style
 * колонок "Витрати план/факт". Завантаження з БД — окремо у cost-loader.ts;
 * тут лише математика, щоб її можна було покривати Jest у Node.
 *
 * RBAC: ці числа віддаються/рендеряться лише фінанс-ролям (SUPER_ADMIN).
 * Гейт — у API та UI, не тут.
 */

/** Сирі дані по одній задачі (self), зібрані лоадером. */
export type TaskCostInput = {
  id: string;
  parentTaskId: string | null;
  /** unitCost × quantity (або amount) привʼязаного рядка кошторису, якщо є. */
  estimatePlanned: number | null;
  /** Ручний план витрат (Task.plannedCostManual), якщо немає звʼязку з кошторисом. */
  manualPlanned: number | null;
  /** Σ FinanceEntry(kind=FACT), привʼязаних до задачі (через estimate/stage). */
  financeFact: number;
  /** Σ TimeLog.costSnapshot по задачі. */
  timeLogCost: number;
};

export type TaskCost = {
  /** Витрати самої задачі (без підзадач). */
  plannedSelf: number;
  actualSelf: number;
  /** Self + сума підзадач (рекурсивно). */
  plannedRollup: number;
  actualRollup: number;
};

/**
 * Власні витрати задачі без урахування підзадач.
 * План = estimatePlanned ?? manualPlanned ?? 0. Факт = financeFact + timeLogCost.
 */
export function computeSelfCost(t: TaskCostInput): { planned: number; actual: number } {
  const planned = t.estimatePlanned ?? t.manualPlanned ?? 0;
  const actual = (t.financeFact || 0) + (t.timeLogCost || 0);
  return { planned, actual };
}

/**
 * Будує map taskId -> TaskCost, де *Rollup = self + Σ(rollup усіх нащадків),
 * рекурсивно. Захист від циклів (visited) — щоб пошкоджені дані не зациклили.
 * Задачі без зв'язків (відсутні у вхідному масиві) трактуються як 0.
 */
export function rollupTaskCosts(inputs: TaskCostInput[]): Map<string, TaskCost> {
  const byId = new Map<string, TaskCostInput>();
  const childrenByParent = new Map<string, string[]>();
  for (const t of inputs) {
    byId.set(t.id, t);
    if (t.parentTaskId) {
      const arr = childrenByParent.get(t.parentTaskId) ?? [];
      arr.push(t.id);
      childrenByParent.set(t.parentTaskId, arr);
    }
  }

  const result = new Map<string, TaskCost>();
  const inProgress = new Set<string>();

  function resolve(id: string): TaskCost {
    const cached = result.get(id);
    if (cached) return cached;

    const input = byId.get(id);
    const self = input
      ? computeSelfCost(input)
      : { planned: 0, actual: 0 };

    // Захист від циклу: якщо вузол уже в стеку — рахуємо лише self.
    if (inProgress.has(id)) {
      return { plannedSelf: self.planned, actualSelf: self.actual, plannedRollup: self.planned, actualRollup: self.actual };
    }
    inProgress.add(id);

    let plannedRollup = self.planned;
    let actualRollup = self.actual;
    for (const childId of childrenByParent.get(id) ?? []) {
      if (childId === id) continue; // self-parent guard
      const childCost = resolve(childId);
      plannedRollup += childCost.plannedRollup;
      actualRollup += childCost.actualRollup;
    }

    inProgress.delete(id);
    const cost: TaskCost = {
      plannedSelf: self.planned,
      actualSelf: self.actual,
      plannedRollup,
      actualRollup,
    };
    result.set(id, cost);
    return cost;
  }

  for (const t of inputs) resolve(t.id);
  return result;
}

/**
 * Підсумок по набору задач (для субсуми групи / тоталу проєкту).
 * Очікує rollup-значення КОРЕНЕВИХ задач набору — щоб не подвоювати підзадачі.
 * Викликати з distinct-задачами (не дублювати при multi-assignee fan-out).
 */
export function sumGroupCost(costs: TaskCost[]): { planned: number; actual: number } {
  let planned = 0;
  let actual = 0;
  for (const c of costs) {
    planned += c.plannedRollup;
    actual += c.actualRollup;
  }
  return { planned, actual };
}
