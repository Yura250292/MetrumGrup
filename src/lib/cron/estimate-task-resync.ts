import { prisma } from "@/lib/prisma";
import {
  syncEstimateItemsToTasks as _defaultSync,
  type EstimateToTasksResult,
} from "@/lib/projects/sync-estimate-to-tasks";
import { isEstimateToTasksSyncEnabled } from "@/lib/estimates/feature-flags";

/**
 * Cron hook: повторює sync для APPROVED-кошторисів, які могли бути змінені
 * після попереднього sync (нові estimate items / planning-поля / dependency
 * правки). Вмикається ДВОМА env-прапорами:
 *
 *   1) `ESTIMATE_TO_TASKS_SYNC_ENABLED=true`         — ядро взагалі активне
 *   2) `ESTIMATE_TO_TASKS_AUTO_RESYNC_ENABLED=true`  — фоновий resync дозволений
 *
 * Без обох — no-op (повертає 0). Це дозволяє розкочувати фічу: спершу
 * "manual sync через кнопку" → коли підтвердилось що нічого не зламано,
 * вмикається auto-resync для природного оновлення Gantt.
 *
 * Логіка: беремо APPROVED-кошториси, у яких `updatedAt` молодше за
 * `LOOKBACK_HOURS`. Це покриває правки items, бо `recomputeEstimateTotals`
 * стопить `updatedAt` при кожній мутації. Бот-агент `auditLog` потім
 * показує що було зроблено.
 *
 * Системний user-id для авдиту: береться з env `CRON_SYSTEM_USER_ID`.
 * Якщо змінна не задана — fallback на createdById першого SUPER_ADMIN'а,
 * щоб audit-row не падав на FK.
 */
const LOOKBACK_HOURS = 24;

export type ResyncResult = {
  enabled: boolean;
  scanned: number;
  succeeded: number;
  failed: number;
  totalTasksCreated: number;
  totalTasksUpdated: number;
  totalDependenciesCreated: number;
  errors: string[];
};

export async function fireEstimateTaskResync(
  opts: {
    /** Injection seam — у тестах підмінюємо на mock. У продакшені пусто. */
    sync?: (estimateId: string, userId: string) => Promise<EstimateToTasksResult>;
  } = {},
): Promise<ResyncResult> {
  const sync = opts.sync ?? _defaultSync;
  const empty: ResyncResult = {
    enabled: false,
    scanned: 0,
    succeeded: 0,
    failed: 0,
    totalTasksCreated: 0,
    totalTasksUpdated: 0,
    totalDependenciesCreated: 0,
    errors: [],
  };

  if (!isEstimateToTasksSyncEnabled()) return empty;
  if (process.env.ESTIMATE_TO_TASKS_AUTO_RESYNC_ENABLED !== "true") return empty;

  // Резолв системного user-id для audit-row.
  const systemUserId = await resolveSystemUserId();
  if (!systemUserId) {
    return { ...empty, enabled: true, errors: ["No system user resolved"] };
  }

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);
  const estimates = await prisma.estimate.findMany({
    where: { status: "APPROVED", updatedAt: { gte: since } },
    select: { id: true },
    take: 50,
  });

  const result: ResyncResult = { ...empty, enabled: true, scanned: estimates.length };
  for (const e of estimates) {
    try {
      const r = await sync(e.id, systemUserId);
      result.succeeded += 1;
      result.totalTasksCreated += r.tasksCreated;
      result.totalTasksUpdated += r.tasksUpdated;
      result.totalDependenciesCreated += r.dependenciesCreated;
    } catch (err) {
      result.failed += 1;
      result.errors.push(
        `estimate ${e.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return result;
}

async function resolveSystemUserId(): Promise<string | null> {
  const fromEnv = process.env.CRON_SYSTEM_USER_ID;
  if (fromEnv) return fromEnv;
  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return admin?.id ?? null;
}
