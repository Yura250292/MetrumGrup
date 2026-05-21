import type { BotContext } from '../types';
import { prisma } from '../../src/lib/prisma';
import {
  BotSessionScope,
  type BotChatMessage,
  type BotChatSession,
  type Role,
  type User,
} from '@prisma/client';
import { HISTORY_MESSAGE_LIMIT, SESSION_TTL_HOURS } from './models';

export type LoadedSession = {
  session: BotChatSession;
  history: BotChatMessage[];
  /** null = неприв'язаний Telegram користувач */
  user: User | null;
  /** snapshot ролі та фірми на момент завантаження сесії */
  role: Role | null;
  firmId: string | null;
  scope: BotSessionScope;
};

function resolveScope(ctx: BotContext): BotSessionScope {
  const chat = ctx.chat;
  if (!chat) return BotSessionScope.DM;
  if (chat.type === 'private') return BotSessionScope.DM;
  if ((ctx.message as { message_thread_id?: number } | undefined)?.message_thread_id)
    return BotSessionScope.TOPIC;
  return BotSessionScope.GROUP;
}

function getThreadId(ctx: BotContext): number | null {
  return (
    (ctx.message as { message_thread_id?: number } | undefined)
      ?.message_thread_id ?? null
  );
}

export async function loadOrCreateSession(
  ctx: BotContext,
): Promise<LoadedSession> {
  const telegramUserId = BigInt(ctx.from!.id);
  const chatId = BigInt(ctx.chat!.id);
  const threadId = getThreadId(ctx);
  const scope = resolveScope(ctx);

  const botUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: telegramUserId },
    include: { user: true },
  });
  const linkedUser = botUser?.user ?? null;
  const role = linkedUser?.role ?? null;
  const firmId = linkedUser?.firmId ?? null;

  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);

  const session = await prisma.botChatSession.upsert({
    where: {
      telegramUserId_chatId_threadId: {
        telegramUserId,
        chatId,
        threadId: threadId ?? -1,
      },
    },
    create: {
      telegramUserId,
      chatId,
      threadId: threadId ?? -1,
      scope,
      userId: linkedUser?.id ?? null,
      firmId,
      role,
      expiresAt,
    },
    update: {
      lastActiveAt: new Date(),
      expiresAt,
      userId: linkedUser?.id ?? null,
      firmId,
      role,
      scope,
    },
  });

  const history = await prisma.botChatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_MESSAGE_LIMIT,
  });
  history.reverse();

  return {
    session,
    history,
    user: linkedUser,
    role,
    firmId,
    scope,
  };
}
