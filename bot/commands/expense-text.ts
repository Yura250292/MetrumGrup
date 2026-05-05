import { Markup } from 'telegraf';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { BotContext } from '../types';
import {
  parseExpenseText,
  parseExpenseFromImage,
  type ParsedExpense,
} from '../../src/lib/ai/parse-expense-text';
import { r2Client } from '../../src/lib/r2-client';

const APPROVER_ROLES = ['SUPER_ADMIN', 'MANAGER', 'FINANCIER'] as const;
type ApproverRole = (typeof APPROVER_ROLES)[number];

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'metrum';

const PDF_MIME = 'application/pdf';
const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatAmount(n: number): string {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
}

function formatExpenseLine(e: ParsedExpense): string {
  const icon = e.costType === 'MATERIAL' ? '📦' : '🔨';
  const label = e.costType === 'MATERIAL' ? 'Матеріал' : 'Робота';
  const qty = e.quantity ? ` — ${e.quantity}${e.unit ? ' ' + e.unit : ''}` : '';
  const price = e.unitPrice ? ` × ${formatAmount(e.unitPrice)}` : '';
  return `${icon} <b>${label}:</b> ${escapeHtml(e.title)}${qty}${price} = ${formatAmount(e.amount)} грн`;
}

function extractApartmentNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.match(/\b(\d{1,4})\b/);
  return m ? Number(m[1]) : null;
}

// ─── /link <slug-or-id> ───────────────────────────────────────────────

export async function linkProjectCommand(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) {
    await ctx.reply('⚠️ Команда /link працює лише в групових чатах.');
    return;
  }

  const text = (ctx.message && 'text' in ctx.message ? ctx.message.text : '') || '';
  const arg = text.replace(/^\/link(@\w+)?/i, '').trim();
  if (!arg) {
    await ctx.reply('⚠️ Вкажи slug або id проекту: <code>/link tiffani</code>', {
      parse_mode: 'HTML',
    });
    return;
  }

  const fromId = ctx.from?.id;
  if (!fromId) return;

  const { prisma } = await import('../../src/lib/prisma');

  const botUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { user: { select: { id: true, role: true, firmId: true, isActive: true } } },
  });
  const linked = botUser?.user;
  if (!linked || !linked.isActive) {
    await ctx.reply("⛔️ Спочатку прив'яжи Metrum-акаунт. Напиши боту в особисті: /start");
    return;
  }
  if (!APPROVER_ROLES.includes(linked.role as ApproverRole)) {
    await ctx.reply("⛔️ Тільки менеджер/фінансист може прив'язувати проект.");
    return;
  }

  const project = await prisma.project.findFirst({
    where: { OR: [{ slug: arg }, { id: arg }] },
    select: { id: true, title: true, slug: true, firmId: true },
  });
  if (!project) {
    await ctx.reply(`❌ Проект "${arg}" не знайдено.`);
    return;
  }
  if (linked.firmId && project.firmId && linked.firmId !== project.firmId) {
    await ctx.reply('⛔️ Цей проект належить іншій фірмі.');
    return;
  }

  const chatId = BigInt(chat.id);
  const conflict = await prisma.project.findFirst({
    where: { telegramChatId: chatId, NOT: { id: project.id } },
    select: { id: true, title: true },
  });
  if (conflict) {
    await ctx.reply(
      `⚠️ Ця група вже прив'язана до проекту "${escapeHtml(conflict.title)}". Спочатку відв'яжи через /unlink в тому проекті.`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  await prisma.project.update({
    where: { id: project.id },
    data: {
      telegramChatId: chatId,
      telegramLinkedAt: new Date(),
      telegramLinkedById: linked.id,
    },
  });

  await ctx.reply(
    `✅ Група прив'язана до проекту <b>${escapeHtml(project.title)}</b>.\n\n` +
      `Тепер у кожному топіку (квартирі) напиши <code>/num &lt;номер&gt;</code> або просто додай нові топіки — бот автозв'яже за номером з назви.`,
    { parse_mode: 'HTML' },
  );
}

export async function unlinkProjectCommand(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return;

  const fromId = ctx.from?.id;
  if (!fromId) return;

  const { prisma } = await import('../../src/lib/prisma');
  const botUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { user: { select: { id: true, role: true, isActive: true } } },
  });
  const linked = botUser?.user;
  if (!linked || !linked.isActive || !APPROVER_ROLES.includes(linked.role as ApproverRole)) {
    await ctx.reply("⛔️ Тільки менеджер може відв'язувати групи.");
    return;
  }

  const updated = await prisma.project.updateMany({
    where: { telegramChatId: BigInt(chat.id) },
    data: { telegramChatId: null, telegramLinkedAt: null, telegramLinkedById: null },
  });
  await ctx.reply(updated.count > 0 ? "✅ Група відв'язана." : 'ℹ️ Ця група не була прив\'язана.');
}

// ─── /num <N> та авто-bind топіків ───────────────────────────────────

async function bindStageToTopic(
  ctx: BotContext,
  apartmentNumber: number,
): Promise<{ ok: true; stageName: string } | { ok: false; reason: string }> {
  const chat = ctx.chat;
  const msg = ctx.message;
  if (!chat || !msg) return { ok: false, reason: 'no chat' };
  if (!('message_thread_id' in msg) || !msg.message_thread_id) {
    return { ok: false, reason: 'Команду треба писати у топіку (квартирі), а не в General.' };
  }
  const threadId = msg.message_thread_id;

  const { prisma } = await import('../../src/lib/prisma');
  const project = await prisma.project.findFirst({
    where: { telegramChatId: BigInt(chat.id) },
    select: { id: true, title: true, firmId: true },
  });
  if (!project) {
    return { ok: false, reason: 'Цю групу не прив\'язано до проекту. Спочатку /link <slug>.' };
  }

  const stage = await prisma.projectStageRecord.findFirst({
    where: {
      projectId: project.id,
      OR: [
        { customName: { equals: `Квартира ${apartmentNumber}`, mode: 'insensitive' } },
        { customName: { contains: String(apartmentNumber), mode: 'insensitive' } },
      ],
    },
    select: { id: true, customName: true, telegramThreadId: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (!stage) {
    return { ok: false, reason: `Квартиру №${apartmentNumber} у проекті "${project.title}" не знайдено. Створи її в Metrum.` };
  }

  // Detach this thread from any other stage first (one thread = one stage).
  await prisma.projectStageRecord.updateMany({
    where: { projectId: project.id, telegramThreadId: threadId, NOT: { id: stage.id } },
    data: { telegramThreadId: null },
  });
  await prisma.projectStageRecord.update({
    where: { id: stage.id },
    data: { telegramThreadId: threadId },
  });

  return { ok: true, stageName: stage.customName || `Квартира ${apartmentNumber}` };
}

export async function numCommand(ctx: BotContext) {
  const text = (ctx.message && 'text' in ctx.message ? ctx.message.text : '') || '';
  const arg = text.replace(/^\/num(@\w+)?/i, '').trim();
  const num = extractApartmentNumber(arg);
  if (!num) {
    await ctx.reply('⚠️ Використай: <code>/num 192</code> — у топіку квартири.', { parse_mode: 'HTML' });
    return;
  }

  const fromId = ctx.from?.id;
  if (!fromId) return;
  const { prisma } = await import('../../src/lib/prisma');
  const botUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { user: { select: { role: true, isActive: true } } },
  });
  const role = botUser?.user?.role;
  if (!botUser?.user?.isActive || !role || !APPROVER_ROLES.includes(role as ApproverRole)) {
    await ctx.reply("⛔️ Тільки менеджер може прив'язувати топік.");
    return;
  }

  const r = await bindStageToTopic(ctx, num);
  if (!r.ok) {
    await ctx.reply(`❌ ${r.reason}`);
    return;
  }
  await ctx.reply(
    `✅ Топік прив'язаний до <b>${escapeHtml(r.stageName)}</b>.\n\nМожеш писати сюди витрати — бот сам розпізнає.`,
    { parse_mode: 'HTML' },
  );
}

/**
 * Listener for forum_topic_created events — auto-bind by number from topic name.
 */
export async function handleForumTopicCreated(ctx: BotContext) {
  const msg = ctx.message;
  if (!msg || !('forum_topic_created' in msg) || !msg.forum_topic_created) return;
  if (!('message_thread_id' in msg) || !msg.message_thread_id) return;

  const name = msg.forum_topic_created.name;
  const num = extractApartmentNumber(name);
  if (!num) return; // topic without number — can't auto-bind

  const r = await bindStageToTopic(ctx, num);
  if (r.ok) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      `🔗 Автоприв'язано до <b>${escapeHtml(r.stageName)}</b>. Майстри можуть писати сюди витрати.`,
      { parse_mode: 'HTML', message_thread_id: msg.message_thread_id },
    );
  }
}

// ─── Multi-format expense intake ──────────────────────────────────────

interface LinkedContext {
  project: { id: string; title: string; firmId: string | null };
  author: { id: string; firmId: string | null };
  stage: { id: string; customName: string | null };
  threadId: number;
}

async function resolveLinkedContext(ctx: BotContext): Promise<
  | { ok: true; ctx: LinkedContext }
  | { ok: false; replyToUser?: string; silent?: boolean }
> {
  const chat = ctx.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) {
    return { ok: false, silent: true };
  }
  const msg = ctx.message;
  if (!msg) return { ok: false, silent: true };
  const fromId = ctx.from?.id;
  if (!fromId) return { ok: false, silent: true };

  const { prisma } = await import('../../src/lib/prisma');
  const project = await prisma.project.findFirst({
    where: { telegramChatId: BigInt(chat.id) },
    select: { id: true, title: true, firmId: true },
  });
  if (!project) return { ok: false, silent: true }; // group not linked

  // Forum: messages in General have no message_thread_id (or is_topic_message=false).
  const threadId =
    'message_thread_id' in msg && msg.message_thread_id ? msg.message_thread_id : null;
  const isTopic = 'is_topic_message' in msg ? Boolean(msg.is_topic_message) : !!threadId;
  if (!threadId || !isTopic) return { ok: false, silent: true }; // ignore General

  const stage = await prisma.projectStageRecord.findFirst({
    where: { projectId: project.id, telegramThreadId: threadId },
    select: { id: true, customName: true },
  });
  if (!stage) {
    return {
      ok: false,
      replyToUser:
        '⚠️ Цей топік ще не прив\'язаний до квартири. Менеджере, напиши <code>/num &lt;номер&gt;</code> один раз.',
    };
  }

  const botUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { user: { select: { id: true, isActive: true, firmId: true } } },
  });
  const author = botUser?.user;
  if (!author || !author.isActive) {
    const handle = ctx.from?.username ? '@' + ctx.from.username : ctx.from?.first_name || '';
    return {
      ok: false,
      replyToUser: `${handle ? handle + ', ' : ''}спочатку прив\'яжи Metrum-акаунт — напиши боту в особисті: /start`,
    };
  }
  if (author.firmId && project.firmId && author.firmId !== project.firmId) {
    return { ok: false, silent: true };
  }

  return { ok: true, ctx: { project, author: { id: author.id, firmId: author.firmId }, stage, threadId } };
}

async function uploadBufferToR2(
  buffer: Buffer,
  key: string,
  mimeType: string,
): Promise<{ key: string; size: number } | null> {
  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return { key, size: buffer.length };
  } catch (err) {
    console.error('[expense-text] R2 upload error:', err);
    return null;
  }
}

async function downloadTelegramFile(ctx: BotContext, fileId: string): Promise<Buffer | null> {
  try {
    const link = await ctx.telegram.getFileLink(fileId);
    const res = await fetch(link.href);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error('[expense-text] download error:', err);
    return null;
  }
}

async function showConfirmCard(
  ctx: BotContext,
  draftId: string,
  parsed: ParsedExpense[],
  stageName: string,
  attachmentNote?: string,
) {
  const total = parsed.reduce((s, e) => s + e.amount, 0);
  const lines = parsed.map(formatExpenseLine).join('\n');
  const lowConf = parsed.filter((e) => e.confidence < 0.7).length;
  const warning = lowConf > 0 ? `\n\n⚠️ <i>Перевір — ${lowConf} рядок(ів) розпізнано неоднозначно</i>` : '';
  const note = attachmentNote ? `\n📎 <i>${escapeHtml(attachmentNote)}</i>` : '';
  const msgId = ctx.message?.message_id;

  await ctx.reply(
    `🧾 <b>Зрозумів ${parsed.length} витрат · ${escapeHtml(stageName)}</b>\n\n` +
      lines +
      `\n\n<b>Разом:</b> ${formatAmount(total)} грн` +
      note +
      warning,
    {
      parse_mode: 'HTML',
      ...(msgId ? { reply_parameters: { message_id: msgId } } : {}),
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Відправити менеджеру', `exp_send:${draftId}`)],
        [Markup.button.callback('❌ Скасувати', `exp_cancel:${draftId}`)],
      ]),
    },
  );
}

async function persistDraft(opts: {
  ctx: BotContext;
  link: LinkedContext;
  parsed: ParsedExpense[];
  rawText: string;
  attachment?: { r2Key: string; mime: string; name: string; size: number };
}): Promise<string> {
  const { ctx, link, parsed, rawText, attachment } = opts;
  const { prisma } = await import('../../src/lib/prisma');
  const draft = await prisma.pendingExpenseDraft.create({
    data: {
      chatId: BigInt(ctx.chat!.id),
      threadId: link.threadId,
      messageId: ctx.message!.message_id,
      authorUserId: link.author.id,
      projectId: link.project.id,
      stageRecordId: link.stage.id,
      parsedJson: parsed as unknown as object,
      rawText: rawText.slice(0, 4000),
      r2Key: attachment?.r2Key,
      attachmentMime: attachment?.mime,
      attachmentName: attachment?.name,
      attachmentSize: attachment?.size,
    },
    select: { id: true },
  });
  return draft.id;
}

// ─── Text handler ────────────────────────────────────────────────────

export async function handleGroupExpenseText(ctx: BotContext): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !('text' in msg)) return false;
  const text = msg.text;
  if (!text || text.startsWith('/')) return false;

  const linkResult = await resolveLinkedContext(ctx);
  if (!linkResult.ok) {
    if (linkResult.replyToUser) {
      await ctx.reply(linkResult.replyToUser, { parse_mode: 'HTML' });
      return true;
    }
    return false;
  }
  const link = linkResult.ctx;

  let parsed: ParsedExpense[];
  try {
    parsed = await parseExpenseText(text);
  } catch (err) {
    console.error('[expense-text] parser error:', err);
    return true;
  }
  if (parsed.length === 0) return false; // chatter — fall through

  const draftId = await persistDraft({ ctx, link, parsed, rawText: text });
  await showConfirmCard(ctx, draftId, parsed, link.stage.customName ?? '');
  return true;
}

// ─── Photo handler ───────────────────────────────────────────────────

export async function handleGroupExpensePhoto(ctx: BotContext): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !('photo' in msg) || !msg.photo) return false;

  const linkResult = await resolveLinkedContext(ctx);
  if (!linkResult.ok) {
    if (linkResult.replyToUser) {
      await ctx.reply(linkResult.replyToUser, { parse_mode: 'HTML' });
      return true;
    }
    return false;
  }
  const link = linkResult.ctx;

  // Telegram sends multiple sizes — biggest is last.
  const photo = msg.photo[msg.photo.length - 1];
  const buffer = await downloadTelegramFile(ctx, photo.file_id);
  if (!buffer) {
    await ctx.reply('❌ Не вдалось завантажити фото.');
    return true;
  }

  let parsed: ParsedExpense[] = [];
  try {
    parsed = await parseExpenseFromImage(buffer, 'image/jpeg');
  } catch (err) {
    console.error('[expense-text] image parse error:', err);
  }
  if (parsed.length === 0) {
    await ctx.reply(
      '🤔 Не зміг розпізнати витрати на фото. Якщо це чек — спробуй чіткіше або напиши текстом.',
      msg.message_id ? { reply_parameters: { message_id: msg.message_id } } : {},
    );
    return true;
  }

  const r2Key = `financing/drafts/${link.project.id}/${Date.now()}_${photo.file_unique_id}.jpg`;
  const r2 = await uploadBufferToR2(buffer, r2Key, 'image/jpeg');

  const draftId = await persistDraft({
    ctx,
    link,
    parsed,
    rawText: msg.caption ?? '[photo]',
    attachment: r2 ? { r2Key: r2.key, mime: 'image/jpeg', name: 'photo.jpg', size: r2.size } : undefined,
  });
  await showConfirmCard(ctx, draftId, parsed, link.stage.customName ?? '', r2 ? 'фото додано до запису' : undefined);
  return true;
}

// ─── Document handler (PDF, Excel) ───────────────────────────────────

export async function handleGroupExpenseDocument(ctx: BotContext): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !('document' in msg) || !msg.document) return false;
  const doc = msg.document;
  const mime = doc.mime_type || '';

  const isPdf = mime === PDF_MIME || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false);
  const isXlsx =
    XLSX_MIMES.has(mime) ||
    /\.(xlsx?|xlsm)$/i.test(doc.file_name || '');
  if (!isPdf && !isXlsx) return false; // ignore other doc types

  const linkResult = await resolveLinkedContext(ctx);
  if (!linkResult.ok) {
    if (linkResult.replyToUser) {
      await ctx.reply(linkResult.replyToUser, { parse_mode: 'HTML' });
      return true;
    }
    return false;
  }
  const link = linkResult.ctx;

  await ctx.reply('⏳ Читаю документ...');

  const buffer = await downloadTelegramFile(ctx, doc.file_id);
  if (!buffer) {
    await ctx.reply('❌ Не вдалось завантажити документ.');
    return true;
  }

  let extractedText = '';
  try {
    if (isPdf) {
      const { parsePDF } = await import('../../src/lib/pdf-helper');
      const r = await parsePDF(buffer);
      extractedText = r.text || '';
    } else {
      const xlsx = await import('xlsx');
      const wb = xlsx.read(buffer, { type: 'buffer' });
      const parts: string[] = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const csv = xlsx.utils.sheet_to_csv(sheet, { FS: '\t' });
        parts.push(`=== ${name} ===\n${csv}`);
      }
      extractedText = parts.join('\n\n').slice(0, 30000); // cap to avoid huge prompts
    }
  } catch (err) {
    console.error('[expense-text] doc extraction failed:', err);
    await ctx.reply(`❌ Не вдалось прочитати документ: ${err instanceof Error ? err.message : 'помилка'}`);
    return true;
  }

  if (!extractedText.trim()) {
    await ctx.reply('🤔 Документ порожній або не містить тексту.');
    return true;
  }

  let parsed: ParsedExpense[] = [];
  try {
    parsed = await parseExpenseText(extractedText);
  } catch (err) {
    console.error('[expense-text] doc parse error:', err);
  }
  if (parsed.length === 0) {
    await ctx.reply('🤔 Не зміг витягти витрати з документа. Якщо там є — напиши вручну текстом.');
    return true;
  }

  const ext = isPdf ? 'pdf' : 'xlsx';
  const r2Key = `financing/drafts/${link.project.id}/${Date.now()}_${doc.file_unique_id}.${ext}`;
  const r2 = await uploadBufferToR2(buffer, r2Key, mime || (isPdf ? PDF_MIME : 'application/octet-stream'));

  const draftId = await persistDraft({
    ctx,
    link,
    parsed,
    rawText: msg.caption || doc.file_name || `[${ext}]`,
    attachment: r2
      ? { r2Key: r2.key, mime: mime || (isPdf ? PDF_MIME : 'application/octet-stream'), name: doc.file_name || `file.${ext}`, size: r2.size }
      : undefined,
  });
  await showConfirmCard(ctx, draftId, parsed, link.stage.customName ?? '', r2 ? `${ext.toUpperCase()} додано до запису` : undefined);
  return true;
}

// ─── Send / Cancel callbacks ─────────────────────────────────────────

export async function handleExpenseSendCallback(ctx: BotContext, draftId: string) {
  const fromId = ctx.from?.id;
  if (!fromId) {
    await ctx.answerCbQuery();
    return;
  }

  const { prisma } = await import('../../src/lib/prisma');
  const draft = await prisma.pendingExpenseDraft.findUnique({ where: { id: draftId } });
  if (!draft) {
    await ctx.answerCbQuery('Draft вже не дійсний', { show_alert: true });
    return;
  }

  const tgUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { userId: true },
  });
  if (!tgUser?.userId || tgUser.userId !== draft.authorUserId) {
    await ctx.answerCbQuery('Підтвердити може тільки автор повідомлення', { show_alert: true });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: draft.projectId },
    select: { id: true, title: true, firmId: true },
  });
  if (!project) {
    await ctx.answerCbQuery('Проект не знайдено');
    return;
  }

  const items = draft.parsedJson as unknown as ParsedExpense[];
  const username = ctx.from?.username ? '@' + ctx.from.username : ctx.from?.first_name || 'TG';

  await ctx.answerCbQuery('⏳ Створюю записи...');

  const created: { id: string; title: string; amount: number }[] = [];
  for (const item of items) {
    const category = item.costType === 'MATERIAL' ? 'materials' : 'subcontractors';
    const entry = await prisma.financeEntry.create({
      data: {
        type: 'EXPENSE',
        kind: 'FACT',
        status: 'PENDING',
        amount: item.amount,
        currency: item.currency || 'UAH',
        occurredAt: new Date(),
        projectId: project.id,
        firmId: project.firmId ?? null,
        stageRecordId: draft.stageRecordId,
        category,
        costType: item.costType,
        title: item.title,
        description: `Telegram (${username}): ${item.rawLine || draft.rawText.slice(0, 200)}`,
        createdById: draft.authorUserId,
        source: 'MANUAL',
      },
      select: { id: true, title: true, amount: true },
    });
    created.push({ id: entry.id, title: entry.title, amount: Number(entry.amount) });

    // Attach the original file (if any) to the first entry only, to avoid
    // duplicating large attachments across N rows from one document.
    if (created.length === 1 && draft.r2Key) {
      try {
        await prisma.financeEntryAttachment.create({
          data: {
            entryId: entry.id,
            r2Key: draft.r2Key,
            originalName: draft.attachmentName || 'attachment',
            mimeType: draft.attachmentMime || 'application/octet-stream',
            size: draft.attachmentSize ?? 0,
            uploadedById: draft.authorUserId,
          },
        });
      } catch (err) {
        console.error('[expense-text] attachment link error:', err);
      }
    }
  }

  const { notifyFinanceApprovers } = await import('../../src/lib/financing/notify-approval');
  for (const c of created) {
    await notifyFinanceApprovers(
      {
        id: c.id,
        title: c.title,
        type: 'EXPENSE',
        amount: c.amount,
        projectTitle: project.title,
      },
      draft.authorUserId,
    );
  }

  await prisma.pendingExpenseDraft.delete({ where: { id: draftId } }).catch(() => {});

  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.editMessageText(
    `📨 <b>Відправлено менеджеру</b> (${created.length} запис${created.length === 1 ? '' : 'ів'}).\n\n` +
      `Чекай підтвердження — як менеджер натисне "✅", запис стане факт-витратою.`,
    { parse_mode: 'HTML' },
  ).catch(() => {});
}

export async function handleExpenseCancelCallback(ctx: BotContext, draftId: string) {
  const fromId = ctx.from?.id;
  if (!fromId) {
    await ctx.answerCbQuery();
    return;
  }
  const { prisma } = await import('../../src/lib/prisma');
  const draft = await prisma.pendingExpenseDraft.findUnique({
    where: { id: draftId },
    select: { authorUserId: true },
  });
  if (!draft) {
    await ctx.answerCbQuery();
    return;
  }
  const tgUser = await prisma.telegramBotUser.findUnique({
    where: { telegramId: BigInt(fromId) },
    select: { userId: true },
  });
  if (tgUser?.userId !== draft.authorUserId) {
    await ctx.answerCbQuery('Скасувати може тільки автор', { show_alert: true });
    return;
  }
  await prisma.pendingExpenseDraft.delete({ where: { id: draftId } }).catch(() => {});
  await ctx.answerCbQuery('Скасовано');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.editMessageText('❌ <i>Скасовано</i>', { parse_mode: 'HTML' }).catch(() => {});
}
