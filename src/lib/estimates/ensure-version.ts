import { prisma } from "@/lib/prisma";
import { createEstimateVersion } from "@/lib/versioning";

/**
 * Гарантує, що для кошторису існує активна версія (P2).
 *
 * Перший кошторис має мати: versionNumber=1, versionType=ORIGINAL,
 * isActive=true, isLocked=false. `createEstimateVersion` ставить ці дефолти
 * (versionType/isActive/isLocked — schema defaults), а versionNumber рахує як
 * MAX+1.
 *
 * Idempotent: якщо активна версія вже є — повертає її id без створення нової
 * (partial unique index `estimate_versions_one_active` забороняє дві активні).
 *
 * ВАЖЛИВО: викликати ПІСЛЯ commit транзакції створення estimate —
 * `createEstimateVersion` читає estimate через глобальний prisma-клієнт, тож
 * усередині незакоміченої транзакції він його не побачить.
 */
export async function ensureActiveEstimateVersion(
  estimateId: string,
  userId: string,
): Promise<string> {
  const active = await prisma.estimateVersion.findFirst({
    where: { estimateId, isActive: true },
    select: { id: true },
  });
  if (active) return active.id;

  const created = await createEstimateVersion({
    estimateId,
    userId,
    eventType: "CREATED",
    description: "Початкова версія (auto)",
  });
  return created.id;
}
