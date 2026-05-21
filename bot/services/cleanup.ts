import { prisma } from '../../src/lib/prisma';

const SIX_HOURS_MS = 6 * 3600 * 1000;
const AUDIT_LOG_RETENTION_DAYS = 180;

/**
 * Видаляє прострочені BotChatSession (каскадно — і messages),
 * а також старші 180 днів записи з BotAuditLog. Запускається cron'ом
 * у `bot/index.ts` через setInterval.
 */
export async function runBotCleanup(): Promise<void> {
  const now = new Date();
  const auditCutoff = new Date(
    now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 3600 * 1000,
  );

  try {
    const sessions = await prisma.botChatSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const audits = await prisma.botAuditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } },
    });
    if (sessions.count > 0 || audits.count > 0) {
      console.log(
        `[bot-cleanup] deleted ${sessions.count} sessions, ${audits.count} audit rows`,
      );
    }
  } catch (err) {
    console.error('[bot-cleanup] failed:', err);
  }
}

export function startBotCleanupCron(): NodeJS.Timeout {
  // запустити одразу + кожні 6 годин
  void runBotCleanup();
  return setInterval(() => void runBotCleanup(), SIX_HOURS_MS);
}
