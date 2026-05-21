import { prisma } from "@/lib/prisma";

/**
 * Default TaskStatus and TaskLabel rows seeded for every project.
 * Idempotent: re-running does not create duplicates thanks to the
 * (projectId, name) unique index + `skipDuplicates: true`.
 */

/**
 * 4-status модель з review-loop'ом:
 *  - "Новий"     — задача створена, виконавець ще не прийняв.
 *  - "В роботі"  — виконавець підтвердив (Accept).
 *  - "Вирішено"  — виконавець помітив як зроблену; чекає підтвердження Автора.
 *  - "Закрито"   — Автор підтвердив що все ок. Фінал (isDone=true).
 *
 * Переходи:
 *   Виконавець: Новий → В роботі → Вирішено
 *   Автор:      Вирішено → Закрито (Confirm) / В роботі (Reject)
 *   Адмін:      будь-який перехід
 *
 * Назви статусів — ключі у мапінгу скриптів міграцій (defaults.ts не може
 * перейменовувати; для існуючих проектів є scripts/migrate-task-statuses.ts).
 */
export const DEFAULT_STATUSES: Array<{
  name: string;
  color: string;
  position: number;
  isDone: boolean;
  isDefault: boolean;
}> = [
  { name: "Новий", color: "#94a3b8", position: 0, isDone: false, isDefault: true },
  { name: "В роботі", color: "#3b82f6", position: 1, isDone: false, isDefault: false },
  { name: "Вирішено", color: "#f59e0b", position: 2, isDone: false, isDefault: false },
  { name: "Закрито", color: "#10b981", position: 3, isDone: true, isDefault: false },
];

export const DEFAULT_LABELS: Array<{ name: string; color: string }> = [
  { name: "bug", color: "#ef4444" },
  { name: "feature", color: "#3b82f6" },
  { name: "docs", color: "#8b5cf6" },
  { name: "urgent", color: "#f97316" },
  { name: "blocker", color: "#dc2626" },
  { name: "question", color: "#06b6d4" },
];

export async function seedProjectTaskDefaults(projectId: string): Promise<void> {
  // Statuses
  await prisma.taskStatus.createMany({
    data: DEFAULT_STATUSES.map((s) => ({ projectId, ...s })),
    skipDuplicates: true,
  });
  // Labels
  await prisma.taskLabel.createMany({
    data: DEFAULT_LABELS.map((l) => ({ projectId, ...l })),
    skipDuplicates: true,
  });
}

export async function getOrCreateDefaultStatus(projectId: string) {
  const existing = await prisma.taskStatus.findFirst({
    where: { projectId, isDefault: true },
  });
  if (existing) return existing;

  await seedProjectTaskDefaults(projectId);
  const seeded = await prisma.taskStatus.findFirst({
    where: { projectId, isDefault: true },
  });
  if (!seeded) {
    throw new Error(`Failed to seed default task status for project ${projectId}`);
  }
  return seeded;
}
