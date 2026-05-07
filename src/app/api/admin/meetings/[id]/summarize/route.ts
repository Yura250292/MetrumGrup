import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const MODEL = process.env.OPENAI_MEETING_MODEL || "gpt-4o";

const SYSTEM_PROMPT = `Ти — досвідчений бізнес-аналітик і асистент керівника. Аналізуєш транскрипти ділових нарад будівельної компанії українською мовою. Твоя задача — витягнути з розмови МАКСИМУМ корисної інформації і повернути її у структурованому JSON форматі.

КРИТИЧНО ВАЖЛИВО (часті провали попередніх версій — НЕ ПОВТОРЮЙ):
- Транскрипт може містити помилки розпізнавання голосу (особливо в іменах, по-батькові, назвах фірм, адресах). Якщо бачиш дивне слово, що не звучить як українське — спробуй здогадатися, що мали на увазі (наприклад: «Серій» → «Сергій», «Раковский» → «Раковського»). У summary можна вживати найвірогіднішу версію, у tasks — лиши той варіант, що в транскрипті, але напиши в context: «уточнити написання імені».
- ОБОВʼЯЗКОВО витягуй кожну дію-намір. Будь-яка фраза типу «треба піти туди», «треба звернутись до X», «треба подзвонити», «треба написати», «треба перевірити», «треба узгодити», «треба запитати», «треба з\'ясувати», «треба домовитись», «нагадай», «не забудь» — це або задача (tasks), або принаймні keyPoint. Не пропускай їх ніколи. Краще створити дрібну задачу, ніж проігнорувати.
- Якщо в розмові звучить «зробити це до пʼятниці», «до кінця місяця», «до завтра» — це дедлайн задачі.
- Якщо хтось каже «я зроблю», «я поговорю», «я зателефоную» — він стає assignee цієї задачі.

ЗАГАЛЬНІ ПРАВИЛА:
- Не скорочуй на догоду стислості. Краще багато конкретики, ніж сухий перелік. Цей підсумок читатимуть учасники наради через тиждень — їм має бути зрозуміло все, що обговорювалось, навіть якщо вони не повертатимуться до запису.
- Підсумок (summary) має бути повним: 6-12 речень, де описано контекст, основні теми, ключові висновки і атмосферу обговорення. Не одне-два речення.
- Кожна задача має містити не лише назву і відповідального, а й контекст (чому виникла, що саме треба зробити), пріоритет і критерій успіху, якщо це виходить з розмови.
- Цілі (goals) — це те, чого нарада/проєкт хотіла досягти. Пріоритети (priorities) — що зараз найважливіше зробити в першу чергу.
- Ризики (risks) — все що може зірвати плани: затримки постачань, нестача людей, юридичні питання, фінансові ризики, технічні проблеми.
- Якщо в транскрипті згадуються конкретні цифри, суми, обʼєми, дати, постачальники, обʼєкти — обовʼязково зберігай їх. Не узагальнюй.
- Зберігай імена учасників так, як їх вимовляли (Сергій, Олег, Андрій, Анна тощо). По-батькові — якщо звучало.
- Якщо дедлайн чи відповідальний не вказано прямо — поверни null, не вигадуй.
- Пріоритет задачі: "HIGH" (критично/блокер/гаряче), "MEDIUM" (важливо), "LOW" (бажано), null — якщо неможливо визначити.
- Усі текстові поля — українською.

ЯКОСТІ ХОРОШОГО ПІДСУМКУ:
1. Читач, що пропустив нараду, отримує повну картину.
2. Усі ключові цифри, імена, обʼєкти, дати збережені.
3. Жодна важлива деталь не проігнорована заради стислості.
4. Кожен «треба зробити X» з розмови — присутній або в tasks, або в keyPoints.
5. Задачі сформульовані так, що відповідальний може взятися за виконання без додаткових питань.

САМОПЕРЕВІРКА перед відповіддю:
- Чи я витяг усі дії-наміри? Якщо в транскрипті 5 разів сказали «треба» — у мене має бути ≥5 елементів у tasks/keyPoints разом.
- Чи я зберіг усі цифри і дати, що звучали?
- Чи summary дає повну картину наради?`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestedTitle: {
      type: "string",
      description:
        "Коротка змістовна назва наради (4-8 слів) на основі того, про що насправді йшла мова. Без дати, без слова «Нарада» на початку якщо тема явна. Приклади: «Оптимізація бухгалтерії і відпустки команди», «Затвердження бюджету RD-02 на травень», «Графік постачань цегли і кран». Українською.",
    },
    summary: {
      type: "string",
      description:
        "Розгорнутий підсумок наради на 6-12 речень. Опиши контекст, ключові теми, висновки, настрій. Не короти.",
    },
    context: {
      type: ["string", "null"],
      description:
        "Передумови наради: чому зустрілись, що було перед цим, який стан проєкту/питання на момент обговорення. Null якщо неможливо визначити.",
    },
    goals: {
      type: "array",
      items: { type: "string" },
      description:
        "Цілі наради або обговорюваного проєкту/етапу. Чого хочуть досягти учасники в коротко- і середньостроковій перспективі.",
    },
    keyPoints: {
      type: "array",
      items: { type: "string" },
      description:
        "Ключові моменти обговорення з достатньою деталізацією — щоб людина, яка не була на нараді, зрозуміла суть розмови. Зберігай цифри, імена, обʼєкти.",
    },
    decisions: {
      type: "array",
      items: { type: "string" },
      description:
        "Прийняті рішення з мотивацією. Не лише ЩО вирішили, а й коротко ЧОМУ.",
    },
    priorities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          level: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          reason: { type: ["string", "null"] },
        },
        required: ["title", "level", "reason"],
      },
      description:
        "Пріоритети за результатами наради. Що зараз найважливіше зробити в першу чергу і чому.",
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          assignee: { type: ["string", "null"] },
          dueDate: { type: ["string", "null"] },
          priority: {
            type: ["string", "null"],
            enum: ["HIGH", "MEDIUM", "LOW", null],
          },
          context: {
            type: ["string", "null"],
            description:
              "Чому ця задача виникла, що саме треба зробити, які умови/деталі обговорювались.",
          },
          successCriteria: {
            type: ["string", "null"],
            description: "За якою ознакою задачу можна вважати виконаною.",
          },
        },
        required: [
          "title",
          "assignee",
          "dueDate",
          "priority",
          "context",
          "successCriteria",
        ],
      },
      description:
        "Задачі з відповідальними, дедлайнами, пріоритетом, контекстом і критерієм успіху.",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description:
        "Ризики, блокери, проблеми, що можуть зірвати плани. Затримки постачань, фінансові, юридичні, технічні питання.",
    },
    nextSteps: {
      type: "array",
      items: { type: "string" },
      description:
        "Наступні кроки — що відбудеться після цієї наради до наступного контрольного моменту.",
    },
    openQuestions: {
      type: "array",
      items: { type: "string" },
      description:
        "Невирішені питання, які потребують подальшого обговорення або уточнення.",
    },
  },
  required: [
    "suggestedTitle",
    "summary",
    "context",
    "goals",
    "keyPoints",
    "decisions",
    "priorities",
    "tasks",
    "risks",
    "nextSteps",
    "openQuestions",
  ],
} as const;

const AUTO_TITLE_RE = /^Нарада(\s+\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|$)/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY не налаштований" },
      { status: 500 }
    );
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!meeting.transcript?.trim()) {
    return NextResponse.json(
      { error: "Транскрипт ще не готовий" },
      { status: 400 }
    );
  }

  await prisma.meeting.update({
    where: { id },
    data: { status: "SUMMARIZING", processingError: null },
  });

  try {
    const userParts = [
      `Назва наради: ${meeting.title}`,
      meeting.description ? `Опис/контекст від організатора: ${meeting.description}` : null,
      "",
      "Транскрипт:",
      meeting.transcript,
      "",
      "Витягни з цього транскрипту максимум корисної інформації згідно з інструкцією і схемою. Не економ на деталях. Не пропускай важливі цифри/імена/дати. Якщо нарада тривала довго — підсумок має це відображати глибиною аналізу.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userParts },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "meeting_summary",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const structured = JSON.parse(raw);
    const tokensUsed = response.usage?.total_tokens ?? null;

    const suggested =
      typeof structured.suggestedTitle === "string"
        ? structured.suggestedTitle.trim()
        : "";
    const shouldAutoRename =
      suggested.length > 0 && AUTO_TITLE_RE.test(meeting.title.trim());

    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        status: "READY",
        title: shouldAutoRename ? suggested : undefined,
        summary: structured.summary ?? null,
        structured,
        aiModelUsed: MODEL,
        aiTokensUsed: tokensUsed,
      },
    });

    return NextResponse.json({ meeting: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summarization failed";
    console.error("Summarize error:", err);
    await prisma.meeting.update({
      where: { id },
      data: { status: "FAILED", processingError: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
