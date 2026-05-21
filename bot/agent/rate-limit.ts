import { RateLimitError } from './errors';

type Bucket = { tokens: number; updatedAt: number };

const GLOBAL_CAPACITY = 20;
const GLOBAL_REFILL_PER_SEC = GLOBAL_CAPACITY / 60;

const MUTATION_FINANCIER_CAPACITY = 5;
const MUTATION_FINANCIER_REFILL_PER_SEC = MUTATION_FINANCIER_CAPACITY / 3600;

const globalBuckets = new Map<string, Bucket>();
const mutationBuckets = new Map<string, Bucket>();

function take(
  store: Map<string, Bucket>,
  key: string,
  capacity: number,
  refillPerSec: number,
): void {
  const now = Date.now();
  const b = store.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsedSec = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
  b.updatedAt = now;
  if (b.tokens < 1) {
    const retryAfterSec = Math.ceil((1 - b.tokens) / refillPerSec);
    store.set(key, b);
    throw new RateLimitError(retryAfterSec);
  }
  b.tokens -= 1;
  store.set(key, b);
}

export function consumeGlobal(telegramUserId: bigint): void {
  take(
    globalBuckets,
    String(telegramUserId),
    GLOBAL_CAPACITY,
    GLOBAL_REFILL_PER_SEC,
  );
}

export function consumeFinancierMutation(telegramUserId: bigint): void {
  take(
    mutationBuckets,
    String(telegramUserId),
    MUTATION_FINANCIER_CAPACITY,
    MUTATION_FINANCIER_REFILL_PER_SEC,
  );
}
