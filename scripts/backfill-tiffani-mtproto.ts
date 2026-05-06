/**
 * Backfill історичних витрат з Telegram-форуму "Тіфані" у Metrum Studio.
 *
 * ОБМЕЖЕННЯ Bot API: бот не може читати історію. Цей скрипт використовує
 * MTProto API (gramjs) під особистим Telegram-акаунтом — той самий API,
 * яким користується Telegram Desktop. Перший запуск спитає номер телефону
 * і код з SMS, наступні використовують збережену сесію.
 *
 * Що робить:
 *   1. Логінить твій Telegram-акаунт (один раз)
 *   2. Знаходить групу-форум за DB Project.telegramChatId або за --chat
 *   3. Тягне всі топіки (channels.GetForumTopics)
 *   4. Для кожного топіку → знаходить StageRecord з telegramThreadId
 *      або зіставляє за номером з назви (як живий бот)
 *   5. Іде по всіх повідомленнях у топіку (iterMessages, replyTo=topicId)
 *   6. Парсить text / photo / PDF / Excel — ту саму pipeline що live-бот
 *   7. Створює FinanceEntry { status: 'DRAFT' } прив'язану до квартири,
 *      occurredAt = дата повідомлення, з оригінальним файлом як attachment
 *   8. Ідемпотентність через FinanceEntry.tgImportKey — повторний запуск
 *      пропускає вже імпортовані повідомлення
 *
 * Використання:
 *   npx tsx scripts/backfill-tiffani-mtproto.ts                # all history
 *   npx tsx scripts/backfill-tiffani-mtproto.ts --since 2026-01-01
 *   npx tsx scripts/backfill-tiffani-mtproto.ts --chat -1001234567890
 *   npx tsx scripts/backfill-tiffani-mtproto.ts --chat-username tiffani_chat
 *   npx tsx scripts/backfill-tiffani-mtproto.ts --dry-run      # parse only, no DB writes
 *   npx tsx scripts/backfill-tiffani-mtproto.ts --topic 192    # only this topic
 *
 * .env потрібно:
 *   TG_USER_API_ID, TG_USER_API_HASH (з https://my.telegram.org → API)
 */

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
// `input` ships without typings — npm pkg "input" is a tiny CLI-prompt lib.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const input = require("input") as { text: (q: string) => Promise<string> };
import bigInt from "big-integer";
import * as fs from "fs";
import * as path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "../src/lib/prisma";
import { r2Client } from "../src/lib/r2-client";
import {
  parseExpenseText,
  parseExpenseFromImage,
  type ParsedExpense,
} from "../src/lib/ai/parse-expense-text";

// ─── Config ───────────────────────────────────────────────────────────

const PROJECT_SLUG = "tiffani";
const SESSION_PATH = path.join(__dirname, ".session-tiffani-backfill");
const TMP_DIR = path.join(__dirname, "tmp", "tiffani");
const R2_BUCKET = process.env.R2_BUCKET_NAME || "metrum";

const PDF_MIME = "application/pdf";
const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

// ─── CLI args ─────────────────────────────────────────────────────────

interface Args {
  since?: Date;
  chatId?: string;
  chatUsername?: string;
  chatTitle: string;
  topicNumber?: number;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { dryRun: false, chatTitle: "Тіфані" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since" && argv[i + 1]) out.since = new Date(argv[++i]);
    else if (a === "--chat" && argv[i + 1]) out.chatId = argv[++i];
    else if (a === "--chat-username" && argv[i + 1]) out.chatUsername = argv[++i];
    else if (a === "--chat-title" && argv[i + 1]) out.chatTitle = argv[++i];
    else if (a === "--topic" && argv[i + 1]) out.topicNumber = Number(argv[++i]);
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

// ─── Telegram client ──────────────────────────────────────────────────

async function getClient(): Promise<TelegramClient> {
  const apiId = Number(process.env.TG_USER_API_ID);
  const apiHash = process.env.TG_USER_API_HASH;
  if (!apiId || !apiHash) {
    throw new Error("Missing TG_USER_API_ID / TG_USER_API_HASH in .env");
  }

  const sessionStr = fs.existsSync(SESSION_PATH)
    ? fs.readFileSync(SESSION_PATH, "utf-8").trim()
    : "";
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => await input.text("📱 Номер телефону (з кодом країни, напр. +380...): "),
    phoneCode: async () => await input.text("🔑 Код з Telegram (SMS або у застосунку): "),
    password: async () => await input.text("🔐 2FA пароль (якщо є; Enter якщо ні): "),
    onError: (err) => console.error("[tg-login]", err),
  });

  if (!sessionStr) {
    fs.writeFileSync(SESSION_PATH, client.session.save() as unknown as string);
    console.log(`✓ Session збережено у ${SESSION_PATH}`);
  }

  return client;
}

// ─── Resolve project + chat entity ────────────────────────────────────

async function resolveProject() {
  const project = await prisma.project.findUnique({
    where: { slug: PROJECT_SLUG },
    select: { id: true, title: true, firmId: true, telegramChatId: true },
  });
  if (!project) throw new Error(`Project "${PROJECT_SLUG}" не знайдено`);
  return project;
}

async function findDialogByTitle(client: TelegramClient, title: string) {
  const wanted = title.trim().toLowerCase();
  for await (const d of client.iterDialogs({})) {
    const t = (d.title || d.name || "").trim().toLowerCase();
    if (t === wanted) return d.entity;
  }
  // Fallback — partial match (case-insensitive contains)
  for await (const d of client.iterDialogs({})) {
    const t = (d.title || d.name || "").trim().toLowerCase();
    if (t.includes(wanted)) return d.entity;
  }
  return null;
}

async function resolveChatEntity(client: TelegramClient, args: Args, projectChatId: bigint | null) {
  if (args.chatUsername) return await client.getEntity(args.chatUsername);
  if (args.chatId) return await client.getEntity(bigInt(args.chatId));
  if (projectChatId) return await client.getEntity(bigInt(projectChatId.toString()));

  // Fallback — search among user's dialogs by title (default "Тіфані").
  console.log(`🔎 Шукаю групу "${args.chatTitle}" серед діалогів...`);
  const found = await findDialogByTitle(client, args.chatTitle);
  if (!found) {
    throw new Error(
      `Не знайшов групу "${args.chatTitle}" серед твоїх діалогів. ` +
        `Передай явно --chat <id> чи --chat-username <name>, ` +
        `або зроби /link tiffani через бота в потрібній групі.`,
    );
  }
  // any-cast — Entity is a discriminated union; id exists on all member types we care about
  // (Channel, Chat). We persist it back so live-бот теж не потребує /link.
  const id = (found as unknown as { id: { toString(): string } }).id?.toString();
  if (id) {
    const idBig = BigInt(id.startsWith("-") ? id : `-100${id}`);
    try {
      await prisma.project.update({
        where: { slug: PROJECT_SLUG },
        data: {
          telegramChatId: idBig,
          telegramLinkedAt: new Date(),
        },
      });
      console.log(`✓ Знайшов і прив'язав до Metrum: chatId=${idBig}`);
    } catch (err) {
      console.warn("[link-back] не вдалось зберегти chatId у Project:", err);
    }
  }
  return found;
}

// ─── Forum topics ─────────────────────────────────────────────────────

interface TopicInfo {
  id: number;
  title: string;
}

async function listForumTopics(client: TelegramClient, channel: Api.TypeInputPeer): Promise<TopicInfo[]> {
  const topics: TopicInfo[] = [];
  let offsetTopic = 0;
  let offsetDate = 0;
  let offsetId = 0;
  for (;;) {
    const res = (await client.invoke(
      new Api.channels.GetForumTopics({
        channel,
        limit: 100,
        offsetTopic,
        offsetDate,
        offsetId,
      }),
    )) as Api.messages.ForumTopics;
    const batch = res.topics.filter((t): t is Api.ForumTopic => t.className === "ForumTopic");
    if (batch.length === 0) break;
    for (const t of batch) topics.push({ id: t.id, title: t.title });
    if (batch.length < 100) break;
    const last = batch[batch.length - 1];
    offsetTopic = last.id;
    offsetDate = last.date;
    offsetId = last.topMessage;
  }
  return topics;
}

function extractApartmentNumber(s: string): number | null {
  const m = s.match(/\b(\d{1,4})\b/);
  return m ? Number(m[1]) : null;
}

// ─── Parsing dispatcher ───────────────────────────────────────────────

interface ParsedSource {
  parsed: ParsedExpense[];
  rawText: string;
  attachment?: {
    buffer: Buffer;
    mime: string;
    name: string;
  };
}

async function parseMessage(
  client: TelegramClient,
  msg: Api.Message,
): Promise<ParsedSource | null> {
  const text = msg.message ?? "";

  // Plain text
  if (!msg.media && text.trim().length >= 5) {
    const parsed = await parseExpenseText(text);
    if (parsed.length > 0) return { parsed, rawText: text };
    return null;
  }

  // Photo
  if (msg.photo) {
    const buffer = (await client.downloadMedia(msg, {})) as Buffer | undefined;
    if (!buffer) return null;
    const parsed = await parseExpenseFromImage(buffer, "image/jpeg");
    if (parsed.length === 0) return null;
    return { parsed, rawText: text || "[photo]", attachment: { buffer, mime: "image/jpeg", name: `photo_${msg.id}.jpg` } };
  }

  // Document (PDF / Excel / others)
  if (msg.document) {
    const doc = msg.document as Api.Document;
    const filenameAttr = doc.attributes?.find(
      (a): a is Api.DocumentAttributeFilename => a.className === "DocumentAttributeFilename",
    );
    const filename = filenameAttr?.fileName ?? `file_${msg.id}`;
    const mime = doc.mimeType ?? "";
    const isPdf = mime === PDF_MIME || /\.pdf$/i.test(filename);
    const isXlsx = XLSX_MIMES.has(mime) || /\.(xlsx?|xlsm)$/i.test(filename);
    if (!isPdf && !isXlsx) return null;

    const buffer = (await client.downloadMedia(msg, {})) as Buffer | undefined;
    if (!buffer) return null;

    let extracted = "";
    try {
      if (isPdf) {
        const { parsePDF } = await import("../src/lib/pdf-helper");
        const r = await parsePDF(buffer);
        extracted = r.text || "";
      } else {
        const xlsx = await import("xlsx");
        const wb = xlsx.read(buffer, { type: "buffer" });
        const parts: string[] = [];
        for (const name of wb.SheetNames) {
          const sheet = wb.Sheets[name];
          parts.push(`=== ${name} ===\n${xlsx.utils.sheet_to_csv(sheet, { FS: "\t" })}`);
        }
        extracted = parts.join("\n\n").slice(0, 30000);
      }
    } catch (err) {
      console.warn(`  ⚠️ extract failed for msg ${msg.id}:`, err instanceof Error ? err.message : err);
      return null;
    }

    if (!extracted.trim()) return null;
    const parsed = await parseExpenseText(extracted);
    if (parsed.length === 0) return null;
    return {
      parsed,
      rawText: text || filename,
      attachment: { buffer, mime: mime || (isPdf ? PDF_MIME : "application/octet-stream"), name: filename },
    };
  }

  return null;
}

// ─── R2 upload ────────────────────────────────────────────────────────

async function uploadToR2(buffer: Buffer, key: string, mime: string): Promise<{ key: string; size: number } | null> {
  try {
    await r2Client.send(
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: mime }),
    );
    return { key, size: buffer.length };
  } catch (err) {
    console.error("[r2] upload error:", err);
    return null;
  }
}

// ─── Author resolution ────────────────────────────────────────────────

const fallbackAdminCache = new Map<string, string>();
async function resolveFallbackAdmin(firmId: string | null): Promise<string> {
  const key = firmId ?? "_";
  if (fallbackAdminCache.has(key)) return fallbackAdminCache.get(key)!;

  // Cascade: same-firm SUPER_ADMIN → global (no firm) SUPER_ADMIN → any SUPER_ADMIN.
  let admin =
    firmId &&
    (await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true, firmId },
      select: { id: true },
    }));
  if (!admin) {
    admin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true, firmId: null },
      select: { id: true },
    });
  }
  if (!admin) {
    admin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { id: true },
    });
  }
  if (!admin) throw new Error("Не знайдено жодного SUPER_ADMIN у системі");

  fallbackAdminCache.set(key, admin.id);
  return admin.id;
}

async function resolveAuthor(msg: Api.Message, firmId: string | null): Promise<string> {
  const fromId = (msg.fromId as Api.PeerUser | undefined)?.userId;
  if (fromId) {
    const tgUser = await prisma.telegramBotUser.findUnique({
      where: { telegramId: BigInt(fromId.toString()) },
      select: { user: { select: { id: true, isActive: true } } },
    });
    if (tgUser?.user?.isActive) return tgUser.user.id;
  }
  return await resolveFallbackAdmin(firmId);
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const args = parseArgs();
  const project = await resolveProject();

  console.log(`Project: ${project.title} (firmId=${project.firmId ?? "—"})`);
  if (args.dryRun) console.log("🧪 DRY RUN — нічого не запишеться у БД");

  const client = await getClient();
  console.log("✓ Telegram з'єднано");

  const entity = await resolveChatEntity(client, args, project.telegramChatId);
  const channel = await client.getInputEntity(entity);

  const topics = await listForumTopics(client, channel);
  console.log(`✓ Знайдено топіків у форумі: ${topics.length}`);

  // Stage records з нашого проекту, мапа для швидкого пошуку за номером
  const stages = await prisma.projectStageRecord.findMany({
    where: { projectId: project.id },
    select: { id: true, customName: true, telegramThreadId: true },
  });
  const stagesByNumber = new Map<number, { id: string; customName: string | null }>();
  for (const s of stages) {
    const n = s.customName ? extractApartmentNumber(s.customName) : null;
    if (n) stagesByNumber.set(n, { id: s.id, customName: s.customName });
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalNotExpense = 0;

  for (const topic of topics) {
    if (topic.id === 1) continue; // General
    const num = extractApartmentNumber(topic.title);
    if (args.topicNumber && num !== args.topicNumber) continue;
    if (!num) {
      console.log(`  ↷ topic "${topic.title}" — без номера, пропускаю`);
      continue;
    }
    const stage = stagesByNumber.get(num);
    if (!stage) {
      console.log(`  ↷ topic "${topic.title}" → квартиру №${num} не знайдено в Metrum, пропускаю`);
      continue;
    }

    console.log(`\n▶ Топік "${topic.title}" → ${stage.customName} (${stage.id})`);

    let topicCreated = 0;
    let topicSkipped = 0;

    const messages = client.iterMessages(channel, { replyTo: topic.id, reverse: true });
    for await (const msg of messages) {
      if (!msg) continue;
      if (args.since && msg.date && msg.date * 1000 < args.since.getTime()) continue;
      if (msg.action) continue; // service messages (forum_topic_created etc)

      let parsedSrc: ParsedSource | null = null;
      try {
        parsedSrc = await parseMessage(client, msg);
      } catch (err) {
        console.warn(`  ⚠️ parse error msg ${msg.id}:`, err instanceof Error ? err.message : err);
        continue;
      }
      if (!parsedSrc) {
        totalNotExpense++;
        continue;
      }

      const occurredAt = new Date((msg.date ?? Math.floor(Date.now() / 1000)) * 1000);
      const chatIdStr = (entity.id ?? "").toString();
      const authorId = await resolveAuthor(msg, project.firmId);

      // Upload attachment once for the whole batch from this message
      let r2: { key: string; size: number } | null = null;
      if (parsedSrc.attachment && !args.dryRun) {
        const ext = parsedSrc.attachment.name.split(".").pop() || "bin";
        const r2Key = `financing/imports/${project.id}/${msg.id}_${Date.now()}.${ext}`;
        r2 = await uploadToR2(parsedSrc.attachment.buffer, r2Key, parsedSrc.attachment.mime);
      }

      for (let idx = 0; idx < parsedSrc.parsed.length; idx++) {
        const item = parsedSrc.parsed[idx];
        const tgImportKey = `tg:${chatIdStr}:${msg.id}:${idx}`;

        // Idempotency
        const existing = await prisma.financeEntry.findUnique({
          where: { tgImportKey },
          select: { id: true },
        });
        if (existing) {
          topicSkipped++;
          totalSkipped++;
          continue;
        }

        if (args.dryRun) {
          console.log(`  + [dry] ${item.costType} ${item.title} = ${item.amount} грн (msg ${msg.id})`);
          topicCreated++;
          totalCreated++;
          continue;
        }

        const entry = await prisma.financeEntry.create({
          data: {
            type: "EXPENSE",
            kind: "FACT",
            status: "DRAFT", // backfill: silent, не спамити менеджеру
            amount: item.amount,
            currency: item.currency || "UAH",
            occurredAt,
            projectId: project.id,
            firmId: project.firmId ?? null,
            stageRecordId: stage.id,
            category: item.costType === "MATERIAL" ? "materials" : "subcontractors",
            costType: item.costType,
            title: item.title,
            description: `[Telegram backfill] ${item.rawLine || parsedSrc.rawText.slice(0, 200)}`,
            createdById: authorId,
            source: "MANUAL",
            tgImportKey,
          },
          select: { id: true },
        });

        if (r2 && idx === 0) {
          await prisma.financeEntryAttachment
            .create({
              data: {
                entryId: entry.id,
                r2Key: r2.key,
                originalName: parsedSrc.attachment!.name,
                mimeType: parsedSrc.attachment!.mime,
                size: r2.size,
                uploadedById: authorId,
              },
            })
            .catch((err) => console.warn(`  ⚠️ attachment link error msg ${msg.id}:`, err));
        }

        topicCreated++;
        totalCreated++;
      }
    }

    console.log(`  ✓ ${topic.title}: створено ${topicCreated}, пропущено-дублів ${topicSkipped}`);
  }

  console.log(
    `\n──────\nГотово.\n  Створено: ${totalCreated}\n  Пропущено (вже імпортовано): ${totalSkipped}\n  Не-витратних повідомлень: ${totalNotExpense}`,
  );
  console.log(
    `\nЗайди у /admin-v2/financing → фільтр Status=DRAFT — переглянь і батч-затверджуй.`,
  );

  await client.disconnect();
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
