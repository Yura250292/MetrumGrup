/**
 * Preview-only price-increase detection — викликається ПІД ЧАС parse, до approve.
 * На відміну від upsert-supplier-material (який оновлює catalog + history),
 * цей helper лише ЧИТАЄ останню відому ціну і повертає прапор/попереднє значення
 * для UI alert. Catalog НЕ змінює.
 *
 * Threshold синхронізований з approve flow (env SUPPLIER_PRICE_INCREASE_THRESHOLD).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const Decimal = Prisma.Decimal;

function getThreshold(): number {
  const raw = process.env.SUPPLIER_PRICE_INCREASE_THRESHOLD;
  if (!raw) return 0.1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0.1;
}

function normalizeKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "");
}

export interface PriceCheckInput {
  counterpartyId: string | null;
  title: string;
  unitPrice: Prisma.Decimal | number | string | null | undefined;
}

export interface PriceCheckResult {
  priceIncreaseFlag: boolean;
  previousUnitPrice: Prisma.Decimal | null;
}

/**
 * Batch-перевіряє кожну позицію проти SupplierMaterial.lastPrice. Без counterpartyId
 * — пропускаємо (нема як знайти попередню ціну). Без unitPrice — пропускаємо.
 */
export async function checkPriceIncreases(
  items: PriceCheckInput[],
): Promise<PriceCheckResult[]> {
  // Збираємо пари (counterpartyId, nameKey) для запиту.
  const lookups: { counterpartyId: string; nameKey: string; newPrice: Prisma.Decimal; idx: number }[] = [];
  items.forEach((it, idx) => {
    if (!it.counterpartyId || it.unitPrice == null) return;
    const newPrice = new Decimal(it.unitPrice);
    if (newPrice.lessThanOrEqualTo(0)) return;
    const nameKey = normalizeKey(it.title);
    if (!nameKey) return;
    lookups.push({ counterpartyId: it.counterpartyId, nameKey, newPrice, idx });
  });

  const results: PriceCheckResult[] = items.map(() => ({
    priceIncreaseFlag: false,
    previousUnitPrice: null,
  }));

  if (lookups.length === 0) return results;

  // Окремий запит на кожен lookup — SupplierMaterial має composite unique
  // (counterpartyId, nameKey), а `OR` ускладнить query plan. К-сть позицій
  // зазвичай < 20, тому це прийнятно.
  const threshold = getThreshold();
  const matches = await Promise.all(
    lookups.map((l) =>
      prisma.supplierMaterial.findUnique({
        where: { counterpartyId_nameKey: { counterpartyId: l.counterpartyId, nameKey: l.nameKey } },
        select: { lastPrice: true },
      }),
    ),
  );

  for (let i = 0; i < lookups.length; i++) {
    const { idx, newPrice } = lookups[i];
    const m = matches[i];
    if (!m?.lastPrice) continue;
    const lastPrice = new Decimal(m.lastPrice);
    if (lastPrice.lessThanOrEqualTo(0)) continue;
    const ratio = newPrice.minus(lastPrice).dividedBy(lastPrice).toNumber();
    if (ratio > threshold) {
      results[idx] = {
        priceIncreaseFlag: true,
        previousUnitPrice: lastPrice,
      };
    }
  }

  return results;
}
