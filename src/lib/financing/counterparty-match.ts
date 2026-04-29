import { prisma } from "@/lib/prisma";

export type CounterpartyHit = { id: string; name: string };

/**
 * Найкращий збіг з таблиці Counterparty для рядка-кандидата (з Excel-імпорту).
 * Стратегія, з падінням за пріоритетом:
 *   1. Точний збіг імені (case-insensitive)
 *   2. Кандидат містить ім'я з БД (наприклад "ТОВ ABC LLC, м. Київ" → "ABC LLC")
 *   3. Ім'я з БД містить кандидата (наприклад "ABC" → "ABC LLC")
 *
 * Пробіли нормалізуємо, обмежуємо до активних. `firmId` обов'язковий — у Group
 * і Studio контрагенти ізольовані, матчимо тільки в межах активної фірми.
 */
export async function matchCounterparties(
  rawNames: string[],
  firmId: string | null,
): Promise<Map<string, CounterpartyHit>> {
  const result = new Map<string, CounterpartyHit>();
  const cleaned = Array.from(
    new Set(
      rawNames
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter((n) => n.length >= 2),
    ),
  );
  if (cleaned.length === 0) return result;

  const all = await prisma.counterparty.findMany({
    where: {
      isActive: true,
      ...(firmId ? { firmId } : {}),
    },
    select: { id: true, name: true },
  });
  if (all.length === 0) return result;

  const lowered = all.map((c) => ({ ...c, lower: c.name.toLowerCase().trim() }));

  for (const raw of cleaned) {
    const candidate = raw.toLowerCase();
    // 1. exact
    let hit = lowered.find((c) => c.lower === candidate);
    // 2. candidate contains stored name (longer first → most specific match)
    if (!hit) {
      const sorted = [...lowered].sort((a, b) => b.lower.length - a.lower.length);
      hit = sorted.find((c) => c.lower.length >= 3 && candidate.includes(c.lower));
    }
    // 3. stored name contains candidate
    if (!hit && candidate.length >= 3) {
      hit = lowered.find((c) => c.lower.includes(candidate));
    }
    if (hit) {
      result.set(raw, { id: hit.id, name: hit.name });
    }
  }

  return result;
}
