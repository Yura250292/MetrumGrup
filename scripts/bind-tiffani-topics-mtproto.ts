/**
 * Запитує Telegram через MTProto список топіків форуму "Тіфані", знаходить
 * номер квартири з кожної назви топіка ("154 квартира" → 154) і прив'язує
 * Project.telegramThreadId автоматично. Без потреби писати /num у кожному
 * топіку вручну.
 *
 * Якщо сесія MTProto існує (з backfill-скрипту) — без логіну. Інакше
 * запитає phone+code.
 *
 * Usage: npx tsx scripts/bind-tiffani-topics-mtproto.ts
 */
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import bigInt from "big-integer";
import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const input = require("input") as { text: (q: string) => Promise<string> };
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";
const SESSION_PATH = path.join(__dirname, ".session-tiffani-backfill");

async function getClient(): Promise<TelegramClient> {
  const apiId = Number(process.env.TG_USER_API_ID);
  const apiHash = process.env.TG_USER_API_HASH;
  if (!apiId || !apiHash) throw new Error("TG_USER_API_ID/HASH missing in .env");

  const sessionStr = fs.existsSync(SESSION_PATH)
    ? fs.readFileSync(SESSION_PATH, "utf-8").trim()
    : "";
  const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("📱 Phone: "),
    phoneCode: async () => await input.text("🔑 SMS code: "),
    password: async () => await input.text("🔐 2FA: "),
    onError: (e) => console.error(e),
  });

  if (!sessionStr) {
    fs.writeFileSync(SESSION_PATH, client.session.save() as unknown as string);
  }
  return client;
}

function extractApt(s: string): number | null {
  const m = s.match(/\b(\d{1,4})\b/);
  return m ? Number(m[1]) : null;
}

async function main() {
  // 1. Find Tiffani folder + projects
  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder Тіфані не знайдено");

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true, telegramChatId: true },
  });
  const aChatId = projects.find((p) => p.telegramChatId)?.telegramChatId;
  if (!aChatId) throw new Error("Жоден проект не має telegramChatId. Запусти backfill спочатку.");

  const byNum = new Map<number, typeof projects[number]>();
  for (const p of projects) {
    const n = extractApt(p.title);
    if (n) byNum.set(n, p);
  }
  console.log(`Project map: ${[...byNum.keys()].sort((a, b) => a - b).join(", ")}`);
  console.log(`chatId: ${aChatId}\n`);

  // 2. Connect to Telegram and fetch topics
  const client = await getClient();
  const entity = await client.getEntity(bigInt(aChatId.toString()));
  const channel = await client.getInputEntity(entity);

  console.log("📥 Fetching forum topics...");
  const topics: { id: number; title: string }[] = [];
  let offsetTopic = 0, offsetDate = 0, offsetId = 0;
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
  console.log(`✓ Знайдено ${topics.length} топіків\n`);

  // 3. Bind each topic to project
  let bound = 0;
  for (const t of topics) {
    if (t.id === 1) continue; // General
    const num = extractApt(t.title);
    if (!num) {
      console.log(`  ↷ "${t.title}" (id=${t.id}): без номера, пропускаю`);
      continue;
    }
    const project = byNum.get(num);
    if (!project) {
      console.log(`  ↷ "${t.title}" (id=${t.id}): Project Кв ${num} не знайдено в БД`);
      continue;
    }

    // Detach this thread from any other project, then attach to the right one
    await prisma.project.updateMany({
      where: {
        telegramChatId: aChatId,
        telegramThreadId: t.id,
        NOT: { id: project.id },
      },
      data: { telegramThreadId: null },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: {
        telegramThreadId: t.id,
        telegramLinkedAt: new Date(),
      },
    });
    console.log(`  ✓ "${t.title}" (thread=${t.id}) → ${project.title}`);
    bound++;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Прив'язано: ${bound} / ${topics.length} топіків`);

  await client.disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
