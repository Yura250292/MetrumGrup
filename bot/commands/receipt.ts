import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import { BotContext, PendingReceipt } from '../types';

/** Chunk flat array of buttons into rows of max `cols` */
function chunkButtons(buttons: InlineKeyboardButton[], cols: number): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += cols) {
    rows.push(buttons.slice(i, i + cols));
  }
  return rows;
}

/**
 * Parse amount from Ukrainian/European text format.
 * Handles "23 121,12" (UA), "23,121.12" (EN), "23121.12", "23121,12", etc.
 * Thousand separators: space or comma (EN) or dot (EU)
 * Decimal separator: comma (UA) or dot (EN)
 */
function parseAmount(raw: string): number | null {
  if (!raw) return null;

  // Strip everything except digits, spaces, commas, dots
  let cleaned = raw.replace(/[^\d\s,.]/g, '').trim();
  if (!cleaned) return null;

  // Remove spaces (thousand separators in UA format)
  cleaned = cleaned.replace(/\s/g, '');

  // If both comma and dot — whichever is LAST is the decimal separator
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // 23.121,12 → comma is decimal, dot is thousand
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // 23,121.12 → dot is decimal, comma is thousand
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // Only comma — decimal if 1-2 digits after, else thousand
    const afterComma = cleaned.length - 1 - lastComma;
    if (afterComma === 1 || afterComma === 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastDot >= 0) {
    // Only dot — decimal if 1-2 digits after, else thousand
    const afterDot = cleaned.length - 1 - lastDot;
    if (afterDot !== 1 && afterDot !== 2) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * /receipt command — start the receipt upload flow
 * Shows folder navigation (same structure as web financing module)
 */
export async function receiptCommand(ctx: BotContext) {
  await showFolderNavigation(ctx, null);
}

/**
 * Show folder/project navigation buttons
 * Mirrors the web interface folder structure for FINANCE domain
 */
async function showFolderNavigation(ctx: BotContext, parentId: string | null) {
  const { prisma } = await import('../../src/lib/prisma');

  const folders = await prisma.folder.findMany({
    where: { domain: 'FINANCE', parentId },
    orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, isSystem: true },
  });

  if (folders.length === 0 && parentId === null) {
    await ctx.reply(
      '📸 <b>Додати чек / накладну</b>\n\n' +
      'Надішліть фото чеку або файл.\n' +
      'Я розпізнаю вміст через AI та створю запис.\n\n' +
      '❌ /cancel — скасувати',
      { parse_mode: 'HTML' }
    );
    if (ctx.session) {
      ctx.session.pendingReceipt = {
        step: 'awaiting_file',
        folderId: null,
      };
    }
    return;
  }

  const buttons: InlineKeyboardButton[][] = [];

  // If inside a subfolder — show "upload here" on its own row at top
  if (parentId) {
    buttons.push([Markup.button.callback('📸 Завантажити чек сюди', `rcpt_select_folder:${parentId}`)]);
  }

  // System blocks first (full-width single column, emphasized)
  const systemFolders = folders.filter((f) => f.isSystem);
  const userFolders = folders.filter((f) => !f.isSystem);

  for (const sf of systemFolders) {
    buttons.push([Markup.button.callback(`🏢 ${sf.name}`, `rcpt_folder:${sf.id}`)]);
  }

  // Separator hint if both kinds exist at this level
  if (systemFolders.length > 0 && userFolders.length > 0) {
    buttons.push([Markup.button.callback('— проєкти —', 'noop')]);
  }

  // User folders grid (max 3 per row)
  if (userFolders.length > 0) {
    const userBtns = userFolders.map((f) =>
      Markup.button.callback(`📁 ${f.name}`, `rcpt_folder:${f.id}`)
    );
    buttons.push(...chunkButtons(userBtns, 3));
  }

  // Footer actions
  if (parentId) {
    buttons.push([
      Markup.button.callback('⬅️ Назад', `rcpt_folder_back:${parentId}`),
      Markup.button.callback('❌ Скасувати', 'receipt_cancel'),
    ]);
  } else {
    buttons.push([Markup.button.callback('❌ Скасувати', 'receipt_cancel')]);
  }

  const title = parentId
    ? '📂 Оберіть підпапку або завантажте сюди:'
    : '📁 <b>Куди віднести витрату?</b>\n\n🏢 — системні блоки (офіс, постійні)\n📁 — проєкти';

  await ctx.reply(title, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons),
  });
}

/**
 * Handle folder navigation callback
 */
export async function handleFolderNavigationCallback(ctx: BotContext, folderId: string) {
  const { prisma } = await import('../../src/lib/prisma');

  // Check if this folder has children
  const children = await prisma.folder.findMany({
    where: { domain: 'FINANCE', parentId: folderId },
    select: { id: true },
    take: 1,
  });

  await ctx.answerCbQuery();

  if (children.length > 0) {
    // Has subfolders — show them
    await showFolderNavigation(ctx, folderId);
  } else {
    // No subfolders — select this folder directly
    await selectFolder(ctx, folderId);
  }
}

/**
 * Handle "back" navigation in folders
 */
export async function handleFolderBackCallback(ctx: BotContext, currentFolderId: string) {
  const { prisma } = await import('../../src/lib/prisma');

  const folder = await prisma.folder.findUnique({
    where: { id: currentFolderId },
    select: { parentId: true },
  });

  await ctx.answerCbQuery();

  // Go to parent's parent (one level up from current view)
  const parentId = folder?.parentId || null;
  const grandparent = parentId
    ? await prisma.folder.findUnique({ where: { id: parentId }, select: { parentId: true } })
    : null;

  await showFolderNavigation(ctx, grandparent?.parentId || null);
}

/**
 * Folder selected — ask for file
 */
async function selectFolder(ctx: BotContext, folderId: string) {
  if (ctx.session) {
    ctx.session.pendingReceipt = {
      step: 'awaiting_file',
      folderId: folderId === '__none__' ? null : folderId,
    };
  }

  const { prisma } = await import('../../src/lib/prisma');
  let folderName = 'Постійна витрата';
  if (folderId !== '__none__') {
    const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { name: true } });
    folderName = folder?.name || folderId;
  }

  await ctx.reply(
    `📁 Папка: <b>${folderName}</b>\n\n` +
    `📸 Тепер надішліть фото чеку або файл (PDF, JPG, PNG).\n` +
    `AI розпізнає вміст автоматично.\n\n` +
    `❌ /cancel — скасувати`,
    { parse_mode: 'HTML' }
  );
}

/**
 * Handle select folder callback
 */
export async function handleSelectFolderCallback(ctx: BotContext, folderId: string) {
  await ctx.answerCbQuery();
  await selectFolder(ctx, folderId);
}

/**
 * Handle incoming photos — OCR with Gemini Vision
 */
export async function handleReceiptPhoto(ctx: BotContext) {
  if (!ctx.session?.isAdmin) return;
  if (!ctx.session.pendingReceipt || ctx.session.pendingReceipt.step !== 'awaiting_file') return;

  const photo = ctx.message && 'photo' in ctx.message ? ctx.message.photo : null;
  if (!photo || photo.length === 0) return;

  const largest = photo[photo.length - 1];

  ctx.session.pendingReceipt.fileId = largest.file_id;
  ctx.session.pendingReceipt.fileName = `receipt_${Date.now()}.jpg`;
  ctx.session.pendingReceipt.mimeType = 'image/jpeg';
  ctx.session.pendingReceipt.fileSize = largest.file_size || 0;

  await processReceiptWithOCR(ctx);
}

/**
 * Handle incoming documents (PDF, etc.)
 */
export async function handleReceiptDocument(ctx: BotContext) {
  if (!ctx.session?.isAdmin) return;
  if (!ctx.session.pendingReceipt || ctx.session.pendingReceipt.step !== 'awaiting_file') return;

  const doc = ctx.message && 'document' in ctx.message ? ctx.message.document : null;
  if (!doc) return;

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (doc.mime_type && !allowedTypes.includes(doc.mime_type)) {
    await ctx.reply('❌ Непідтримуваний формат. Надішліть JPG, PNG або PDF.');
    return;
  }

  ctx.session.pendingReceipt.fileId = doc.file_id;
  ctx.session.pendingReceipt.fileName = doc.file_name || `receipt_${Date.now()}`;
  ctx.session.pendingReceipt.mimeType = doc.mime_type || 'application/octet-stream';
  ctx.session.pendingReceipt.fileSize = doc.file_size || 0;

  await processReceiptWithOCR(ctx);
}

/**
 * Process uploaded file with Gemini Vision OCR
 */
async function processReceiptWithOCR(ctx: BotContext) {
  const receipt = ctx.session!.pendingReceipt!;

  await ctx.reply('🔍 Розпізнаю вміст чеку через AI...');
  await ctx.sendChatAction('typing');

  try {
    // Download file from Telegram
    const fileUrl = await ctx.telegram.getFileLink(receipt.fileId!);
    const response = await fetch(fileUrl.href);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY не налаштовано');
    }

    // OCR with Gemini Vision (try multiple models as fallback)
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const prompt = `Розпізнай цей чек/накладну/рахунок. Витягни структуровану інформацію українською мовою:

1. Назва документу (чек, накладна, рахунок)
2. Контрагент/Постачальник
3. Список товарів/послуг з цінами (якщо є)
4. Загальна сума
5. Дата (якщо видно)

Формат відповіді:
📄 Тип: [тип документу]
🏢 Постачальник: [назва]
📋 Позиції:
- [назва товару] — [ціна] грн
- ...
💰 Сума: [загальна сума] грн
📅 Дата: [дата або "не вказано"]

Якщо щось не вдається розпізнати — напиши "не розпізнано". Відповідай ТІЛЬКИ структурованим текстом, без додаткових пояснень.`;

    const modelsToTry = ['gemini-3-flash-preview', 'gemini-2.5-flash'];
    let ocrText: string | null = null;
    let lastError: unknown = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          { inlineData: { mimeType: receipt.mimeType!, data: base64 } },
          { text: prompt },
        ]);
        ocrText = result.response.text();
        console.log(`[receipt] OCR success with ${modelName}`);
        break;
      } catch (err) {
        lastError = err;
        console.error(`[receipt] OCR failed with ${modelName}:`, err instanceof Error ? err.message : err);
      }
    }

    if (!ocrText) {
      throw lastError instanceof Error ? lastError : new Error('Всі моделі Gemini недоступні');
    }

    // Extract amount from OCR text
    const amountMatch = ocrText.match(/Сума:\s*([\d\s,.]+)/i);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null;

    // Extract supplier
    const supplierMatch = ocrText.match(/Постачальник:\s*(.+)/i);
    const supplier = supplierMatch ? supplierMatch[1].trim() : null;

    receipt.ocrText = ocrText;
    receipt.amount = amount && Number.isFinite(amount) ? amount : undefined;
    receipt.counterparty = supplier || undefined;
    receipt.step = 'awaiting_confirmation';

    // Show OCR result with edit options
    let message = `✅ <b>Розпізнано:</b>\n\n${escapeHtml(ocrText)}\n\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;

    if (amount && Number.isFinite(amount)) {
      message += `💰 Сума: <b>${amount} грн</b>\n`;
    } else {
      message += `💰 Сума: <b>не визначено</b> (введіть вручну)\n`;
    }

    message += `\n<i>Якщо є помилки — надішліть виправлений опис текстом, або натисніть кнопку нижче.</i>`;

    const buttons = [];
    if (amount && Number.isFinite(amount)) {
      buttons.push([
        Markup.button.callback('💸 Витрата', 'rcpt_confirm:EXPENSE'),
        Markup.button.callback('💰 Дохід', 'rcpt_confirm:INCOME'),
      ]);
    }
    buttons.push([Markup.button.callback('✏️ Ввести суму вручну', 'rcpt_edit_amount')]);
    buttons.push([Markup.button.callback('❌ Скасувати', 'receipt_cancel')]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[receipt] OCR error:', errMsg, error);
    receipt.step = 'awaiting_amount';
    await ctx.reply(
      '⚠️ Не вдалося розпізнати вміст автоматично.\n' +
      `<i>(${escapeHtml(errMsg.slice(0, 100))})</i>\n\n` +
      '💰 Введіть суму вручну (в грн):',
      { parse_mode: 'HTML' }
    );
  }
}

/**
 * Handle confirmation — create entry and send to approver
 */
export async function handleReceiptConfirm(
  ctx: BotContext,
  entryType: 'EXPENSE' | 'INCOME' = 'EXPENSE',
) {
  const receipt = ctx.session?.pendingReceipt;
  if (!receipt || receipt.step !== 'awaiting_confirmation') {
    await ctx.answerCbQuery('Немає активного чеку');
    return;
  }

  await ctx.answerCbQuery();

  receipt.entryType = entryType;

  if (!receipt.amount || receipt.amount <= 0) {
    receipt.step = 'awaiting_amount';
    await ctx.reply('💰 Введіть суму (в грн):');
    return;
  }

  await createEntryAndNotifyApprover(ctx);
}

/**
 * Handle edit amount callback
 */
export async function handleEditAmountCallback(ctx: BotContext) {
  if (!ctx.session?.pendingReceipt) {
    await ctx.answerCbQuery('Немає активного чеку');
    return;
  }
  ctx.session.pendingReceipt.step = 'awaiting_amount';
  await ctx.answerCbQuery();
  await ctx.reply('💰 Введіть суму (в грн):\n\nНаприклад: 1500 або 2350.50');
}

/**
 * Handle text input for amount/title during receipt flow
 */
export async function handleReceiptTextInput(ctx: BotContext, text: string): Promise<boolean> {
  if (!ctx.session?.pendingReceipt) return false;

  const receipt = ctx.session.pendingReceipt;

  if (receipt.step === 'awaiting_amount') {
    const amount = parseAmount(text);
    if (!amount) {
      await ctx.reply('❌ Невірна сума. Введіть число більше 0:');
      return true;
    }
    receipt.amount = amount;

    if (!receipt.title) {
      receipt.step = 'awaiting_title';
      await ctx.reply('📝 Короткий опис (назва витрати):\n\nНаприклад: "Клей для плитки", "Пісок 5т"');
    } else {
      await createEntryAndNotifyApprover(ctx);
    }
    return true;
  }

  if (receipt.step === 'awaiting_title') {
    receipt.title = text.trim();
    await createEntryAndNotifyApprover(ctx);
    return true;
  }

  // If user sends text during confirmation — treat as corrected description
  if (receipt.step === 'awaiting_confirmation') {
    receipt.ocrText = text.trim();
    // Try to extract amount from corrected text
    const amountMatch = text.match(/([\d\s,.]+)\s*грн/i);
    if (amountMatch) {
      const amount = parseAmount(amountMatch[1]);
      if (amount) receipt.amount = amount;
    }

    const buttons = [];
    if (receipt.amount && receipt.amount > 0) {
      buttons.push([Markup.button.callback('✅ Створити запис', 'rcpt_confirm')]);
    }
    buttons.push([Markup.button.callback('✏️ Ввести суму вручну', 'rcpt_edit_amount')]);
    buttons.push([Markup.button.callback('❌ Скасувати', 'receipt_cancel')]);

    await ctx.reply(
      `📝 Оновлено опис.\n💰 Сума: ${receipt.amount ? `${receipt.amount} грн` : 'не визначено'}`,
      { ...Markup.inlineKeyboard(buttons) }
    );
    return true;
  }

  return false;
}

/**
 * Create finance entry and send approval request to admin/financier
 */
async function createEntryAndNotifyApprover(ctx: BotContext) {
  const receipt = ctx.session!.pendingReceipt!;

  try {
    await ctx.reply('⏳ Створюю запис...');

    const { prisma } = await import('../../src/lib/prisma');
    const { uploadTelegramFileToR2 } = await import('../services/r2-upload');

    // Find admin user for createdBy
    const botUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    if (!botUser) {
      await ctx.reply('❌ Помилка: немає адмін-користувача в системі');
      return;
    }

    // Determine title
    const title = receipt.title || extractTitleFromOCR(receipt.ocrText) || 'Чек з Telegram';

    // Create the finance entry with PENDING status (awaiting approval)
    const entryType = receipt.entryType || 'EXPENSE';

    const entry = await prisma.financeEntry.create({
      data: {
        type: entryType,
        kind: 'FACT',
        amount: receipt.amount!,
        currency: 'UAH',
        occurredAt: new Date(),
        projectId: null, // Will be linked via folder
        folderId: receipt.folderId || null,
        category: entryType === 'INCOME' ? 'client_advance' : 'MATERIALS',
        title,
        description: receipt.ocrText || `Додано через Telegram бот`,
        counterparty: receipt.counterparty || null,
        createdById: botUser.id,
        status: 'PENDING', // Immediately goes to approval
      },
    });

    // Upload file to R2 and create attachment
    if (receipt.fileId) {
      const fileUrl = await ctx.telegram.getFileLink(receipt.fileId);
      const r2Result = await uploadTelegramFileToR2(
        fileUrl.href,
        `financing/${entry.id}/${receipt.fileName}`,
        receipt.mimeType!
      );

      if (r2Result) {
        await prisma.financeEntryAttachment.create({
          data: {
            entryId: entry.id,
            r2Key: r2Result.key,
            originalName: receipt.fileName!,
            mimeType: receipt.mimeType!,
            size: receipt.fileSize || r2Result.size,
            uploadedById: botUser.id,
          },
        });
      }
    }

    // Get folder name for display
    let folderName = 'Без папки';
    if (receipt.folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: receipt.folderId }, select: { name: true } });
      folderName = folder?.name || receipt.folderId;
    }

    // Send notification to approvers (SUPER_ADMIN, MANAGER, FINANCIER)
    const approvers = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'FINANCIER'] } },
      select: { id: true },
    });

    if (approvers.length > 0) {
      await prisma.notification.createMany({
        data: approvers.map((u) => ({
          userId: u.id,
          type: 'FINANCE_APPROVAL_NEEDED',
          title: '🧾 Новий чек на погодження',
          body: `${title} — ${receipt.amount} грн (${folderName})`,
          relatedEntity: 'FinanceEntry',
          relatedId: entry.id,
        })),
      });
    }

    // Send approval message to the bot chat (for admin to approve inline)
    const typeEmoji = entryType === 'INCOME' ? '💰' : '💸';
    const typeLabel = entryType === 'INCOME' ? 'ДОХІД' : 'ВИТРАТА';
    const approvalMessage =
      `🧾 <b>НОВИЙ ЧЕК НА ПОГОДЖЕННЯ</b>\n\n` +
      `${typeEmoji} Тип: <b>${typeLabel}</b>\n` +
      `📁 Папка: <b>${escapeHtml(folderName)}</b>\n` +
      `📄 ${escapeHtml(title)}\n` +
      `💰 Сума: <b>${receipt.amount} грн</b>\n` +
      (receipt.counterparty ? `🏢 Контрагент: ${escapeHtml(receipt.counterparty)}\n` : '') +
      `\n` +
      (receipt.ocrText ? `<blockquote>${escapeHtml(receipt.ocrText.slice(0, 500))}</blockquote>\n\n` : '') +
      `📊 Статус: На погодженні`;

    const approvalButtons = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Підтверджую оплату', `rcpt_approve:${entry.id}`)],
      [Markup.button.callback('⏰ Нагадати за 1 год', `rcpt_remind:${entry.id}`)],
      [Markup.button.callback('❌ Відхилити', `rcpt_reject:${entry.id}`)],
    ]);

    await ctx.reply(approvalMessage, { parse_mode: 'HTML', ...approvalButtons });

    // Clear pending receipt
    ctx.session!.pendingReceipt = undefined;

  } catch (error) {
    console.error('[receipt] create entry error:', error);
    await ctx.reply('❌ Помилка створення запису. Спробуйте ще раз.');
  }
}

/**
 * Handle approval — mark as PAID
 */
export async function handleApproveCallback(ctx: BotContext, entryId: string) {
  const { prisma } = await import('../../src/lib/prisma');

  const entry = await prisma.financeEntry.findUnique({ where: { id: entryId }, select: { id: true, title: true, status: true } });
  if (!entry) {
    await ctx.answerCbQuery('Запис не знайдено');
    return;
  }

  const botUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } });

  await prisma.financeEntry.update({
    where: { id: entryId },
    data: {
      status: 'PAID',
      approvedAt: new Date(),
      approvedById: botUser?.id,
      paidAt: new Date(),
      updatedById: botUser?.id,
    },
  });

  await ctx.answerCbQuery('✅ Підтверджено!');
  await ctx.editMessageText(
    (ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : '') +
    '\n\n✅ <b>ОПЛАЧЕНО</b> (' + new Date().toLocaleString('uk-UA') + ')',
    { parse_mode: 'HTML' }
  );
}

/**
 * Handle remind in 1 hour
 */
export async function handleRemindCallback(ctx: BotContext, entryId: string) {
  await ctx.answerCbQuery('⏰ Нагадаю через 1 годину');

  // Persist remindAt so web-side cron also re-notifies approvers
  try {
    const { prisma } = await import('../../src/lib/prisma');
    await prisma.financeEntry.update({
      where: { id: entryId },
      data: { remindAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
  } catch (err) {
    console.error('[receipt] failed to set remindAt:', err);
  }

  const chatId = ctx.chat?.id;
  const messageText = ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message
    ? ctx.callbackQuery.message.text
    : '';

  // Schedule reminder after 1 hour
  setTimeout(async () => {
    try {
      if (chatId) {
        const { prisma } = await import('../../src/lib/prisma');
        const entry = await prisma.financeEntry.findUnique({
          where: { id: entryId },
          select: { id: true, title: true, status: true, amount: true },
        });

        if (entry && entry.status === 'PENDING') {
          const buttons = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Підтверджую оплату', `rcpt_approve:${entryId}`)],
            [Markup.button.callback('⏰ Ще 1 год', `rcpt_remind:${entryId}`)],
            [Markup.button.callback('❌ Відхилити', `rcpt_reject:${entryId}`)],
          ]);

          await ctx.telegram.sendMessage(
            chatId,
            `⏰ <b>НАГАДУВАННЯ</b>\n\n` +
            `Чек "<b>${entry.title}</b>" на ${Number(entry.amount)} грн досі очікує погодження.`,
            { parse_mode: 'HTML', ...buttons }
          );
        }
      }
    } catch (error) {
      console.error('[receipt] remind error:', error);
    }
  }, 60 * 60 * 1000); // 1 hour

  await ctx.editMessageReplyMarkup({
    inline_keyboard: [
      [{ text: '✅ Підтверджую оплату', callback_data: `rcpt_approve:${entryId}` }],
      [{ text: '⏰ Нагадування встановлено (1 год)', callback_data: 'noop' }],
      [{ text: '❌ Відхилити', callback_data: `rcpt_reject:${entryId}` }],
    ],
  });
}

/**
 * Handle rejection
 */
export async function handleRejectCallback(ctx: BotContext, entryId: string) {
  const { prisma } = await import('../../src/lib/prisma');

  const botUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } });

  await prisma.financeEntry.update({
    where: { id: entryId },
    data: {
      status: 'DRAFT',
      updatedById: botUser?.id,
    },
  });

  await ctx.answerCbQuery('❌ Відхилено');
  await ctx.editMessageText(
    (ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : '') +
    '\n\n❌ <b>ВІДХИЛЕНО</b> (' + new Date().toLocaleString('uk-UA') + ')',
    { parse_mode: 'HTML' }
  );
}

/**
 * Cancel receipt flow
 */
export async function handleReceiptCancel(ctx: BotContext) {
  if (ctx.session) {
    ctx.session.pendingReceipt = undefined;
  }
  await ctx.answerCbQuery();
  await ctx.reply('❌ Додавання чеку скасовано.');
}

// ─── Helpers ─────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractTitleFromOCR(ocrText?: string): string | null {
  if (!ocrText) return null;
  // Try to get first meaningful line
  const lines = ocrText.split('\n').filter((l) => l.trim().length > 3);
  // Look for supplier line
  const supplierLine = lines.find((l) => /Постачальник/i.test(l));
  if (supplierLine) {
    const name = supplierLine.replace(/.*Постачальник:\s*/i, '').trim();
    if (name.length > 2) return name;
  }
  // Fallback to first substantive line
  return lines[0]?.replace(/^[📄🏢📋💰📅\s]+/, '').slice(0, 50) || null;
}
