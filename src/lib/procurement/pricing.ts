import { Prisma } from "@prisma/client";

export type BidLineInput = {
  qty: Prisma.Decimal | string | number;
  unitPrice: Prisma.Decimal | string | number;
  alternativeOfferPrice?: Prisma.Decimal | string | number | null;
  useAlternative?: boolean;
};

const ZERO = new Prisma.Decimal(0);

function toDecimal(v: Prisma.Decimal | string | number): Prisma.Decimal {
  if (v instanceof Prisma.Decimal) return v;
  return new Prisma.Decimal(v);
}

function assertNonNegative(label: string, d: Prisma.Decimal): void {
  if (d.isNegative()) {
    throw new Error(`procurement.pricing: ${label} must be >= 0`);
  }
}

/**
 * Сума по бідових позиціях: SUM(qty * (useAlt ? altPrice : unitPrice)).
 * Decimal math через Prisma.Decimal — ніколи Number. Empty array → 0.
 * Negative qty / unitPrice / altPrice кидає (UI не повинен пропустити).
 */
export function calcBidTotalPrice(items: BidLineInput[]): Prisma.Decimal {
  if (!items.length) return ZERO;
  let total = ZERO;
  for (const item of items) {
    const qty = toDecimal(item.qty);
    assertNonNegative("qty", qty);
    const useAlt =
      item.useAlternative === true &&
      item.alternativeOfferPrice !== null &&
      item.alternativeOfferPrice !== undefined;
    const price = useAlt
      ? toDecimal(item.alternativeOfferPrice as Prisma.Decimal | string | number)
      : toDecimal(item.unitPrice);
    assertNonNegative("unitPrice", price);
    total = total.plus(qty.times(price));
  }
  return total;
}

export type ScoreInput = {
  /** 1..N, 1 = найменша totalPrice по RFQ. */
  priceRank: number;
  /** 1..N, 1 = найшвидша доставка (deliveryTermsDays asc). */
  deliveryRank: number;
  /** 0..5 рейтинг постачальника. null → 3.0 neutral. */
  rating: number | null;
  /** Кількість бідів у RFQ — для нормалізації рангів. */
  totalBids: number;
};

export type BidScore = {
  /** 0..100, чим більше — тим краще. */
  score: number;
  /** 0..100 — внесок ціни (вага 0.6). */
  price: number;
  /** 0..100 — внесок швидкості доставки (вага 0.2). */
  delivery: number;
  /** 0..100 — внесок рейтингу (вага 0.2). */
  rating: number;
};

/**
 * Composite bid score: 0.6 * priceRank + 0.2 * deliveryRank + 0.2 * rating.
 * Усі компоненти нормалізуються до 0..100 (1-й по rank = 100, останній = 0).
 * Single bid → priceScore=deliveryScore=100, rating з фактичного значення.
 */
export function composeBidScore(input: ScoreInput): BidScore {
  const { priceRank, deliveryRank, rating, totalBids } = input;
  const rankToScore = (rank: number, n: number): number => {
    if (n <= 1) return 100;
    const clamped = Math.max(1, Math.min(rank, n));
    return Math.round(((n - clamped) / (n - 1)) * 100);
  };
  const price = rankToScore(priceRank, totalBids);
  const delivery = rankToScore(deliveryRank, totalBids);
  const ratingValue = rating == null ? 3.0 : Math.max(0, Math.min(rating, 5));
  const ratingScore = Math.round((ratingValue / 5) * 100);
  const score = Math.round(0.6 * price + 0.2 * delivery + 0.2 * ratingScore);
  return { score, price, delivery, rating: ratingScore };
}
