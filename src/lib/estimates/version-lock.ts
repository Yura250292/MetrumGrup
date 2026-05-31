import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient | PrismaClient;

export class EstimateVersionLockedError extends Error {
  constructor(public readonly versionId: string) {
    super(`Estimate version ${versionId} is locked`);
    this.name = "EstimateVersionLockedError";
  }
}

/// Кидає EstimateVersionLockedError якщо активна версія estimate
/// заморожена. Викликати у всіх CRUD-handler-ах, що мутують
/// estimate items / sections.
///
/// Перевіряє "активну версію" — partial unique index гарантує що вона одна.
export async function assertEstimateEditable(
  estimateId: string,
  client: TxClient = prisma,
): Promise<void> {
  const active = await client.estimateVersion.findFirst({
    where: { estimateId, isActive: true },
    select: { id: true, isLocked: true },
  });
  if (active?.isLocked) throw new EstimateVersionLockedError(active.id);
}

/// Заморожує активну версію estimate. Idempotent: повторний виклик на
/// вже locked-версії повертає без помилки.
///
/// Викликати ТІЛЬКИ після внутрішнього погодження кошторису — далі
/// items неможливо буде редагувати без створення нової версії.
export async function lockActiveEstimateVersion(
  estimateId: string,
  userId: string,
  client: TxClient = prisma,
): Promise<{ versionId: string; lockedAt: Date }> {
  const active = await client.estimateVersion.findFirst({
    where: { estimateId, isActive: true },
    select: { id: true, isLocked: true, lockedAt: true },
  });
  if (!active) {
    throw new Error(`No active version found for estimate ${estimateId}`);
  }
  if (active.isLocked && active.lockedAt) {
    return { versionId: active.id, lockedAt: active.lockedAt };
  }
  const lockedAt = new Date();
  await client.estimateVersion.update({
    where: { id: active.id },
    data: { isLocked: true, lockedAt, lockedById: userId },
  });
  return { versionId: active.id, lockedAt };
}

/// Розморожує версію (адмін-only escape hatch). Не для звичайного flow —
/// зазвичай створюємо нову версію через "revised" замість unlock.
export async function unlockEstimateVersion(
  versionId: string,
  client: TxClient = prisma,
): Promise<void> {
  await client.estimateVersion.update({
    where: { id: versionId },
    data: { isLocked: false, lockedAt: null, lockedById: null },
  });
}
