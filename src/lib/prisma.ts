import { PrismaClient } from "@prisma/client";

/**
 * Vercel-serverless + Railway PostgreSQL: кожна лямбда відкриває власні
 * connections. Без обмеження connection_limit Railway швидко вичерпує
 * connection slots ("FATAL: sorry, too many clients already" → P2037).
 *
 * Обмежуємо до 2-х per-instance. Prisma reuse-ить connections з пулу
 * між запитами в межах однієї лямбди. Add `pool_timeout=10` щоб довгий
 * запит не блокував пул назавжди.
 *
 * Кращий fix: використати Railway connection pooler URL (pgbouncer) або
 * Prisma Accelerate. Поточний — пом'якшує симптоми без зміни ENV.
 */
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  // Якщо параметри вже задані ззовні — не перевизначаємо.
  if (raw.includes("connection_limit=")) return raw;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}connection_limit=2&pool_timeout=15`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() ?? "" } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
