/**
 * Phase 3 (supplier-debt): supplier-specific material catalog upsert.
 *
 * Викликається у approve foreman-report transaction для кожного MATERIAL item
 * з заповненим counterpartyId. Логіка:
 *   1. Нормалізувати title → nameKey.
 *   2. Upsert SupplierMaterial у scope (counterpartyId, nameKey).
 *   3. Якщо це не перший раз і ціна підросла понад threshold → виставити
 *      priceIncreaseFlag на ForemanReportItem + зберегти previousUnitPrice
 *      для UI tooltip.
 *   4. Записати рядок у SupplierMaterialPriceHistory (audit trail).
 *
 * Threshold береться з env `SUPPLIER_PRICE_INCREASE_THRESHOLD` (default 0.10 = 10%).
 *
 * Idempotency: повторний approve того самого item не задвоїть priceHistory,
 * бо unique key — (sourceItemId), коли він не null. Але оскільки approve route
 * сам ідемпотентний (через foremanReportItemId @unique на FinanceEntry), цей
 * helper викликається лише один раз на item.
 */
import { Prisma, type PrismaClient } from "@prisma/client";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

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

export type UpsertResult = {
  /// Чи зросла ціна понад threshold vs останнє спостереження.
  priceIncrease: boolean;
  /// Попередня lastPrice (для UI tooltip; null якщо це перше спостереження).
  previousUnitPrice: Decimal | null;
  /// Створений / оновлений SupplierMaterial id.
  supplierMaterialId: string;
};

/**
 * Викликається з approve transaction. Не починає власну транзакцію — використовує
 * tx, що передається з approve route.
 */
export async function upsertSupplierMaterial(
  tx: Tx,
  args: {
    counterpartyId: string;
    firmId: string;
    title: string;
    unit: string | null;
    unitPrice: Decimal | number | string | null;
    occurredAt: Date;
    sourceReportId: string;
    sourceItemId: string;
  },
): Promise<UpsertResult | null> {
  // Без unitPrice не можемо ні відстежити подорожчання, ні оновити lastPrice.
  if (args.unitPrice === null || args.unitPrice === undefined) return null;

  const newPrice = new Decimal(args.unitPrice);
  if (newPrice.lessThanOrEqualTo(0)) return null;

  const nameKey = normalizeKey(args.title);
  if (!nameKey) return null;

  // Спочатку читаємо попередній стан — для коректного previousUnitPrice
  // (Prisma upsert не повертає "old" значення).
  const existing = await tx.supplierMaterial.findUnique({
    where: {
      counterpartyId_nameKey: { counterpartyId: args.counterpartyId, nameKey },
    },
    select: { id: true, lastPrice: true },
  });

  let priceIncrease = false;
  let previousUnitPrice: Decimal | null = null;
  if (existing && existing.lastPrice) {
    const lastPrice = new Decimal(existing.lastPrice);
    if (lastPrice.greaterThan(0)) {
      const ratio = newPrice.minus(lastPrice).dividedBy(lastPrice).toNumber();
      if (ratio > getThreshold()) {
        priceIncrease = true;
        previousUnitPrice = lastPrice;
      }
    }
  }

  // Upsert. createdAt/updatedAt @default/@updatedAt — Prisma управляє самим.
  const upserted = await tx.supplierMaterial.upsert({
    where: {
      counterpartyId_nameKey: { counterpartyId: args.counterpartyId, nameKey },
    },
    create: {
      counterpartyId: args.counterpartyId,
      firmId: args.firmId,
      nameKey,
      name: args.title.trim(),
      unit: args.unit,
      lastPrice: newPrice,
      lastSeenAt: args.occurredAt,
    },
    update: {
      // Оновлюємо display name, бо foreman міг перейменувати "Цемент М400" → "Цемент М-400".
      // Підхід: останнє спостереження виграє.
      name: args.title.trim(),
      unit: args.unit ?? undefined,
      lastPrice: newPrice,
      lastSeenAt: args.occurredAt,
    },
    select: { id: true },
  });

  // Audit row у price history.
  await tx.supplierMaterialPriceHistory.create({
    data: {
      supplierMaterialId: upserted.id,
      price: newPrice,
      unit: args.unit,
      observedAt: args.occurredAt,
      sourceReportId: args.sourceReportId,
      sourceItemId: args.sourceItemId,
    },
  });

  return {
    priceIncrease,
    previousUnitPrice,
    supplierMaterialId: upserted.id,
  };
}
