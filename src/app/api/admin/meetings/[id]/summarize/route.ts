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

const SYSTEM_PROMPT = `Ти — Chief of Staff і досвідчений бізнес-аналітик у будівельній компанії Metrum Group. Аналізуєш транскрипти живих ділових нарад керівників (засновник, директор, інженер, фінансист) і повертаєш ГЛИБОКИЙ структурований аналіз у JSON. Твій підсумок — це робочий документ, на який команда буде спиратися щоб виконувати ухвалене.

═══════════════════════════════════════════════════════════════════
ВХІДНІ ДАНІ
═══════════════════════════════════════════════════════════════════
Тобі дають:
1. ТРАНСКРИПТ із діаризацією (Speaker A, Speaker B, ...) і таймстемпами — від AssemblyAI Universal.
2. ENTITIES (опц.) — pre-extracted іменовані сутності з аудіо: person_name, monetary_value, date, organization, location. Це «золота правда» написання — вживай ЦІ значення дослівно, не вгадуй.
3. ТЕМАТИЧНІ РОЗДІЛИ (опц.) — auto_chapters від AssemblyAI: грубий поділ довгої наради на сюжетні блоки.
4. Опис/контекст від організатора (опц.).

═══════════════════════════════════════════════════════════════════
СПІКЕРИ — ОКРЕМА ВАЖЛИВА ЗАДАЧА
═══════════════════════════════════════════════════════════════════
Транскрипт містить лейбли «Speaker A», «Speaker B», «Speaker C» тощо. Ти маєш ідентифікувати, ХТО це по контексту:
- Якщо у мовленні Speaker B звучить: «Я дзвонив до Юлії і кажу, Юлі, який у нас борг», то Speaker B — це той, хто розмовляє з Юлією. Юлія тут — інша людина (не присутня або інший спікер).
- Якщо інший спікер каже до B: «Серій, зроби рахунок», то B — це Сергій.
- Якщо хтось каже «Я як власник фірми...», «Я як технік...», «Як директор кажу...» — фіксуй роль.
- Враховуй що люди звертаються одне до одного: «Юль...», «Олеже...», «Ліо...».
- Якщо ідентифікація неможлива — guessedName = null, role = null, evidence — поясни чому.

У speakers формуй елемент на КОЖНОГО спікера що в транскрипті. evidence — конкретна цитата звідки ти зробив висновок.

═══════════════════════════════════════════════════════════════════
ЗАПРОПОНОВАНІ РІШЕННЯ — НОВЕ КЛЮЧОВЕ ПОЛЕ
═══════════════════════════════════════════════════════════════════
Учасники часто формулюють проблему («не знаю, як це краще зробити», «не може придумати»), але не доходять до висновку. ТИ запропонуй рішення:
- Знайди у нараді обговорювані проблеми, які учасники не розвʼязали (явно або по інтонації застрягли).
- Для КОЖНОЇ такої проблеми сформулюй конкретне рішення — як саме б ти радив зробити, спираючись на: бізнес-логіку галузі (будівництво, фінансовий облік, ERP-практики, 1С/SAP-патерни де доречно), здоровий глузд, кращі практики.
- Не загальні слова. Конкретика — структура даних, послідовність кроків, формули, аналог із індустрії.
- rationale — чому саме так, які компроміси.
- Якщо проблема явно потребує доробки в IT-системі або процесі — це окремий елемент proposedSolutions.

ВАЖЛИВО: рішення — це твоя експертна порада, а не переказ того, що сказано в транскрипті. Ти бачиш ширше ніж учасники в моменті.

═══════════════════════════════════════════════════════════════════
МОВА І ІМЕНА
═══════════════════════════════════════════════════════════════════
- Транскрипт може бути двомовним (UA/RU) або повністю RU — наша компанія працює з мережею АТБ, частина контрагентів спілкується російською. Це норма.
- Усі поля підсумку (summary, keyPoints, decisions, tasks.title, ...) — УКРАЇНСЬКОЮ.
- АЛЕ імена/ПІБ/назви організацій — ЗБЕРІГАЙ В ОРИГІНАЛЬНОМУ НАПИСАННІ як у транскрипті/entities. «Любовь Николаевна» НЕ стає «Любов Миколаївна» — це втрата контакту. «ООО Будхата» лишається як є.
- Якщо в ENTITIES є person_name або organization — ВИКОРИСТОВУЙ дослівно це написання, навіть якщо в транскрипті трохи інша варіація.

═══════════════════════════════════════════════════════════════════
ВИТЯГ ДІЙ — БУДЬ ЕКСТРЕМАЛЬНО ПРИСКІПЛИВИЙ
═══════════════════════════════════════════════════════════════════
КОЖНА фраза-намір має стати або task-ом, або keyPoint-ом:
- «треба зробити X» / «треба перевірити Y» / «треба узгодити»
- «я зроблю» / «я поговорю» / «я подзвоню» — мовець стає assignee
- «зроби це» / «давай ти займешся» — адресат стає assignee
- «треба добавити в наради…» / «нехай AI запропонує…» — це теж задача, навіть якщо звучить як побажання
- Дедлайни: «до пʼятниці», «до кінця місяця», «завтра», «до релізу» — фіксуй
- Якщо хтось каже «треба добавити фічу в систему», «зробити окрему вкладку», «треба запрограмувати» — це product/dev tasks, окремо позначай

ASSIGNEE: якщо ти ідентифікував спікера (Speaker B = Олег), то у tasks.assignee пиши «Олег», а не «Speaker B». Якщо ні — пиши те ім'я, що звучало («Юля», «Ігор»). null лише коли немає ОДНОГО конкретного відповідального.

═══════════════════════════════════════════════════════════════════
ЦИФРИ, СУМИ, ОБʼЄКТИ
═══════════════════════════════════════════════════════════════════
- Зберігай ВСІ суми (200 тис, 100 тис, 50 тис), обʼєми, відсотки.
- Назви постачальників, обʼєктів, проєктів — точно як звучало.
- Дати — точно. «До пʼятниці» лишай як є; не намагайся обчислювати дату.

═══════════════════════════════════════════════════════════════════
ГЛИБИНА АНАЛІЗУ
═══════════════════════════════════════════════════════════════════
- summary: 8-15 речень для нарад > 5 хв. Включи: про що йшлося, КОНТЕКСТ (що передувало), які тези висували різні спікери, до чого дійшли, що залишилось відкритим, загальний tone (конструктив / суперечка / brainstorm).
- context: 2-4 речення передісторії — що було перед нарадою, чому зустрілись.
- keyPoints: ≥1 пункт на 30-60 секунд транскрипту. Кожен пункт має достатню деталізацію щоб людина яка не була зрозуміла.
- decisions: фіксуй прийняті рішення з причиною (не лише ЩО, а й ЧОМУ).
- tasks: вичерпний перелік. Контекст у tasks.context — 1-2 речення про походження задачі і умови.
- risks: окремо ризики (затримки, конфлікти, юридичне, фінансове, технічне, organizational).
- proposedSolutions: твоя експертна аналітика проблем.
- nextSteps: конкретні кроки на найближчі 1-2 тижні.
- openQuestions: питання що потребують подальшого обговорення/уточнення (відрізняй від ризиків — це питання, а не загроза).

═══════════════════════════════════════════════════════════════════
САМОПЕРЕВІРКА (зроби перед відповіддю)
═══════════════════════════════════════════════════════════════════
1. Я ідентифікував кожного спікера або чесно поставив null з обґрунтуванням?
2. Я витяг кожну фразу-намір? Якщо в транскрипті 8 разів звучало «треба» — у мене ≥8 елементів tasks/keyPoints?
3. Я зберіг усі суми, дати, імена точно як вони звучали?
4. Кожна проблема, що залишилась без відповіді, потрапила або в openQuestions, або в proposedSolutions?
5. Підсумок дає повне розуміння без прослуховування запису?
6. Імена з ENTITIES.person_name використані ДОСЛІВНО, не адаптовані?

Якщо щось «ні» — переробляй.`;

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
        "Глибокий розгорнутий підсумок наради 8-15 речень для нарад > 5 хв. Включи: про що йшлося, передісторія/контекст, ключові тези різних спікерів, до чого дійшли, що залишилось відкритим, загальний tone (конструктив / суперечка / brainstorm). Не короти. Якщо в нараді обговорювалась бізнес-проблема — опиши її суть достатньо щоб читач зрозумів без прослуховування.",
    },
    context: {
      type: ["string", "null"],
      description:
        "2-4 речення про передісторію наради: чому зустрілись, що було перед цим, який стан проєкту/питання на момент обговорення, які дотичні події передували.",
    },
    speakers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: {
            type: "string",
            description:
              "Лейбл спікера з транскрипту: «A», «B», «C» тощо.",
          },
          guessedName: {
            type: ["string", "null"],
            description:
              "Імʼя спікера якщо вдалося визначити з контексту (як до нього звертались, як він себе представив, що говорив про себе). null якщо невпевнено.",
          },
          role: {
            type: ["string", "null"],
            description:
              "Роль/посада спікера якщо випливає з контексту: «директор», «фінансист», «інженер», «власник фірми», «розробник» тощо. null якщо невпевнено.",
          },
          evidence: {
            type: "string",
            description:
              "Конкретна цитата або фраза з транскрипту що підкріплює визначення імені/ролі. Якщо не вдалося визначити — поясни чому (наприклад: «не звертались на імʼя, не представлявся»).",
          },
        },
        required: ["label", "guessedName", "role", "evidence"],
      },
      description:
        "Список усіх спікерів з транскрипту. Один елемент на КОЖЕН лейбл (Speaker A, B, C, ...) що зустрічається. Намагайся визначити кожного — це ключове для подальшої атрибуції задач.",
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
        "Ризики, блокери, проблеми, що можуть зірвати плани. Затримки постачань, фінансові, юридичні, технічні питання, organizational. Кожен пункт — окремий ризик з достатньою деталізацією.",
    },
    proposedSolutions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          problem: {
            type: "string",
            description:
              "Конкретна проблема/виклик/невизначеність що обговорювалась і не дійшла до однозначного рішення. Формулюй як читач має побачити її суть.",
          },
          suggestion: {
            type: "string",
            description:
              "ТВОЯ конкретна порада — як саме розвʼязати. Не загальні слова. Якщо це про IT-систему — опиши структуру даних/UI/процес. Якщо про бізнес-процес — опиши послідовність кроків і ролі. 2-6 речень з конкретикою.",
          },
          rationale: {
            type: "string",
            description:
              "Чому саме така порада: бізнес-логіка індустрії (будівництво/ERP/1С-патерни), кращі практики, які компроміси враховано, чим краща за альтернативи. 1-3 речення.",
          },
          relatedTo: {
            type: ["string", "null"],
            description:
              "Якщо проблема дотична до конкретного проєкту/обʼєкту/задачі — згадай. null якщо загального характеру.",
          },
        },
        required: ["problem", "suggestion", "rationale", "relatedTo"],
      },
      description:
        "ОБОВʼЯЗКОВО проаналізуй кожну проблему/виклик/неясність що обговорювалась у нараді але не дійшла до однозначного рішення — і запропонуй СВОЄ експертне рішення. Це не переказ того, що сказали, а твоя професійна порада як Chief of Staff. Має бути ≥1 елемент якщо в нараді є хоч одна нерозвʼязана проблема. Тільки [] якщо нарада зовсім без обговорення проблем (рідко).",
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
    "speakers",
    "goals",
    "keyPoints",
    "decisions",
    "priorities",
    "tasks",
    "risks",
    "proposedSolutions",
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
    // Synergy крок: GPT-4o отримує не лише сирий транскрипт, а збагачений
    // пакет від AssemblyAI Universal — витягнуті імена/суми/дати/локації,
    // тематичні розділи. Це різко знижує шанс що модель «вгадає» імʼя як
    // «Кривом Ніколаєв» замість «Любовь Николаевна» — бо AssemblyAI вже
    // витягнув його як person_name з вірною орфографією.
    const enrichmentBlocks: string[] = [];

    if (meeting.speakerCount && meeting.speakerCount > 0) {
      enrichmentBlocks.push(
        `СПІКЕРИ (за діаризацією AssemblyAI): ${meeting.speakerCount} особи. У транскрипті позначені як «Speaker A», «Speaker B» і тд. Якщо з контексту вдається ідентифікувати реальне імʼя — підставляй його у tasks.assignee і summary.`
      );
    }

    type Entity = { entity_type?: string | null; text?: string | null };
    const entitiesArr: Entity[] = Array.isArray(meeting.entities)
      ? (meeting.entities as Entity[])
      : [];
    if (entitiesArr.length > 0) {
      const grouped = new Map<string, Set<string>>();
      for (const e of entitiesArr) {
        const t = (e.entity_type ?? "").trim();
        const v = (e.text ?? "").trim();
        if (!t || !v) continue;
        if (!grouped.has(t)) grouped.set(t, new Set());
        grouped.get(t)!.add(v);
      }
      const lines: string[] = [];
      for (const [type, values] of grouped) {
        const list = Array.from(values).slice(0, 30).join(", ");
        lines.push(`  - ${type}: ${list}`);
      }
      if (lines.length > 0) {
        enrichmentBlocks.push(
          `ENTITIES (вже витягнуті AssemblyAI з аудіо — не вгадуй, використовуй ці значення в оригінальному написанні):\n${lines.join("\n")}`
        );
      }
    }

    type Chapter = {
      headline?: string | null;
      summary?: string | null;
      gist?: string | null;
      start?: number | null;
      end?: number | null;
    };
    const chaptersArr: Chapter[] = Array.isArray(meeting.chapters)
      ? (meeting.chapters as Chapter[])
      : [];
    if (chaptersArr.length > 0) {
      const lines = chaptersArr
        .slice(0, 12)
        .map((c, i) => {
          const headline = (c.headline || c.gist || "").trim();
          const summary = (c.summary || "").trim();
          return `  ${i + 1}. ${headline}${summary ? " — " + summary : ""}`;
        })
        .filter(Boolean);
      if (lines.length > 0) {
        enrichmentBlocks.push(
          `ТЕМАТИЧНІ РОЗДІЛИ (від AssemblyAI auto_chapters):\n${lines.join("\n")}`
        );
      }
    }

    const userParts = [
      `Назва наради: ${meeting.title}`,
      meeting.description
        ? `Опис/контекст від організатора: ${meeting.description}`
        : null,
      enrichmentBlocks.length > 0 ? "" : null,
      enrichmentBlocks.length > 0 ? enrichmentBlocks.join("\n\n") : null,
      "",
      "ТРАНСКРИПТ (з лейблами Speaker A/B/C... і таймстемпами):",
      meeting.transcript,
      "",
      "ЗАВДАННЯ:",
      "1. Ідентифікуй кожного спікера (Speaker A, B, ...) → speakers[]. Кожен з evidence-цитатою.",
      "2. Знайди ВСІ дії-наміри і виведи їх у tasks. Assignee — реальне імʼя якщо ідентифікував спікера, інакше те імʼя що звучало.",
      "3. ОБОВʼЯЗКОВО проаналізуй кожну проблему/виклик/неясність → proposedSolutions[] з конкретною експертною порадою. Не переказуй що сказали — давай СВОЄ рішення спираючись на бізнес-логіку індустрії.",
      "4. Імена/ПІБ використовуй ДОСЛІВНО як у транскрипті/ENTITIES — не перекладай і не адаптуй. «Любовь Николаевна» лишається «Любовь Николаевна».",
      "5. Зберігай усі цифри, суми, дати, обʼєкти.",
      "6. Якщо нарада довша 5 хв — summary має бути 8-15 речень, повноцінне.",
      "7. Самоперевірка: пройдись по всіх 6 пунктах із системного промпту перед відповіддю.",
    ]
      .filter((p) => p !== null)
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
      // Ставимо трошки більше temperature для proposedSolutions — там потрібна
      // експертна творчість (запропонувати рішення, а не повторити транскрипт),
      // одночасно strict-schema утримує форму.
      temperature: 0.5,
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
