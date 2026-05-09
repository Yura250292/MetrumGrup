/**
 * Полісер старих транскриптів через GPT-4o.
 *
 * Що робить:
 *  - Бере всі meetings де `transcript` непорожній і ще НЕ полішений
 *    (transcribeProvider не закінчується на ":polished").
 *  - Просить GPT-4o ВИКЛЮЧНО додати/виправити пунктуацію і капіталізацію
 *    на початку речень. Слова/імена/числа НЕ ЗМІНЮЄ.
 *  - Зберігає результат назад у meeting.transcript, маркує provider.
 *  - Запускати: `OPENAI_API_KEY=... npx tsx scripts/polish-transcripts.ts`
 *  - Опційні параметри:
 *      LIMIT=10  — обробити лише N перших (для тесту)
 *      MEETING_ID=<id>  — обробити лише одну нараду
 *      DRY_RUN=1  — нічого не записувати, лише показати diff
 */
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
const MODEL = process.env.OPENAI_POLISH_MODEL || "gpt-4o";

const SYSTEM_PROMPT = `Ти — редактор транскриптів живих ділових нарад. Твоя ЄДИНА задача — додати/виправити пунктуацію і капіталізацію щоб текст легше читався.

ЖОРСТКІ ПРАВИЛА (порушення = провал):
1. НЕ ЗМІНЮЙ ЖОДНОГО СЛОВА. Не перекладай. Не виправляй орфографію. Не замінюй синоніми. Не додавай і не видаляй слова.
2. НЕ ЧІПАЙ імена, прізвища, по-батькові, назви організацій, бренди, абревіатури, числа, дати.
3. НЕ МІНЯЙ мову. Якщо звучало російською — лишається російською.
4. НЕ ВИДАЛЯЙ і НЕ ДОДАВАЙ слова-паразити, повтори, заїки. Все як було.

ЩО МОЖНА і ТРЕБА:
- Додавати «.», «,», «?», «!», «:», «—», «(»/«)», «;» де вони ПРОПУЩЕНІ але напрошуються.
- Виправляти існуючу пунктуацію якщо вона явно неправильна (наприклад, кома там де має бути крапка).
- Капіталізувати першу літеру речень.
- Зберігати лейбли спікерів «Speaker A [00:00]: …» ДОСЛІВНО — не чіпай їх.
- Зберігати порядок слів і структуру реплік 1-в-1.

ФОРМАТ ВІДПОВІДІ:
Поверни лише полішений текст у тому ж форматі що й оригінал (Speaker X [time]: текст, репліки розділені порожнім рядком). Без жодних коментарів, без markdown-обгортки, без префіксів.

САМОПЕРЕВІРКА перед відповіддю:
- Чи я не змінив жодного слова? Кожне слово оригіналу присутнє в моєму тексті у тому ж порядку?
- Чи я зберіг усі лейбли спікерів?
- Чи я не переклав нічого з російської в українську чи навпаки?

Якщо хоч на одне «ні» — переробляй.`;

type MeetingRow = {
  id: string;
  title: string;
  transcript: string | null;
  transcribeProvider: string | null;
};

async function polishOne(text: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    temperature: 0.0,
  });
  return res.choices[0]?.message?.content?.trim() ?? text;
}

// Sanity-check: вилучити пунктуацію/пробіли з обох версій і порівняти кількість
// "значущих" символів. Якщо розходження > 2% — щось пішло не так,
// краще не зберігати.
function safeWordPreservation(original: string, polished: string): boolean {
  const strip = (s: string) =>
    s
      .replace(/[\s\.,!\?…:;\-—\(\)«»"'`]+/g, "")
      .toLowerCase();
  const a = strip(original);
  const b = strip(polished);
  if (a.length === 0) return true;
  const diff = Math.abs(a.length - b.length) / a.length;
  return diff <= 0.02;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Не задано OPENAI_API_KEY");
    process.exit(1);
  }

  const meetingId = process.env.MEETING_ID;
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
  const dryRun = process.env.DRY_RUN === "1";

  console.log("🪄 Полісер транскриптів");
  console.log(`   Модель: ${MODEL}`);
  console.log(`   Dry-run: ${dryRun}`);
  console.log(`   Limit:   ${limit ?? "усі"}`);
  console.log(`   Meeting: ${meetingId ?? "усі непрополісовані"}\n`);

  const where = meetingId
    ? { id: meetingId }
    : {
        transcript: { not: null },
        AND: [
          {
            OR: [
              { transcribeProvider: null },
              { NOT: { transcribeProvider: { endsWith: ":polished" } } },
            ],
          },
        ],
      };

  const meetings = (await prisma.meeting.findMany({
    where,
    select: {
      id: true,
      title: true,
      transcript: true,
      transcribeProvider: true,
    },
    orderBy: { recordedAt: "desc" },
    take: limit,
  })) as MeetingRow[];

  console.log(`Знайдено ${meetings.length} нарад для обробки.\n`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of meetings) {
    const original = m.transcript;
    if (!original || original.trim().length === 0) {
      console.log(`⏭️  ${m.id} (${m.title}) — порожній транскрипт, skip`);
      skipped++;
      continue;
    }

    process.stdout.write(`✏️  ${m.id} (${m.title})... `);
    try {
      const polished = await polishOne(original);
      if (!safeWordPreservation(original, polished)) {
        console.log("⚠️  zaмного відмінностей у словах — skip");
        skipped++;
        continue;
      }
      if (polished === original) {
        console.log("(без змін)");
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`[DRY] +${polished.length - original.length} симв`);
      } else {
        const newProvider =
          (m.transcribeProvider ?? "unknown") + ":polished";
        await prisma.meeting.update({
          where: { id: m.id },
          data: {
            transcript: polished,
            transcribeProvider: newProvider,
          },
        });
        console.log(
          `✅ збережено (+${polished.length - original.length} симв)`,
        );
      }
      ok++;
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`\n──────────────────────────────`);
  console.log(`Полішено:  ${ok}`);
  console.log(`Пропущено: ${skipped}`);
  console.log(`Помилок:   ${failed}`);
  console.log(`──────────────────────────────\n`);
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
