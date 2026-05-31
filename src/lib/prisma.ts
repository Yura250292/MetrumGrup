import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Vercel-serverless + Railway PostgreSQL — без pgbouncer на стороні Railway
 * кожна лямбда відкриває власні connections; з паралельними запитами це
 * швидко вичерпує Railway connection slots (P2037 "too many clients").
 *
 * Стратегія:
 * 1) connection_limit=1 — кожна лямбда тримає одне з'єднання, переюзає
 *    його для всіх послідовних запитів. Прі ~50 одночасних лямбд це <50
 *    конекшнів на Railway (вкладаємось у дефолтні ліміти).
 * 2) pool_timeout=20 — давати pool 20s взяти конекшн з reuse.
 * 3) $extends Retry middleware: при P2037 чекаємо 200/500/1500ms і
 *    повторюємо до 3 разів. Це гасить transient errors під час бурстів.
 *
 * Кращий fix: підняти Railway pgbouncer або switch на Prisma Accelerate —
 * але це потребує зміни DATABASE_URL у ENV.
 */
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  if (raw.includes("connection_limit=")) return raw;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}connection_limit=1&pool_timeout=20`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isPoolExhausted(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === "P2037";
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return /too many clients|connection pool/i.test(err.message);
  }
  return false;
}

function withRetry(client: PrismaClient): PrismaClient {
  // $extends дозволяє обернути ВСІ query на retry. 3 спроби з backoff
  // 200/500/1500ms. Не повторюємо інші помилки (наприклад validation).
  const extended = client.$extends({
    query: {
      async $allOperations({ query, args }) {
        const delays = [200, 500, 1500];
        let lastErr: unknown;
        for (let i = 0; i <= delays.length; i++) {
          try {
            return await query(args);
          } catch (err) {
            lastErr = err;
            if (!isPoolExhausted(err) || i === delays.length) throw err;
            await new Promise((r) => setTimeout(r, delays[i]));
          }
        }
        throw lastErr;
      },
    },
  });
  return extended as unknown as PrismaClient;
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  withRetry(
    new PrismaClient({
      datasources: { db: { url: buildDatabaseUrl() ?? "" } },
    }),
  );

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
