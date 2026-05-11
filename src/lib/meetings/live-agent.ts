import "server-only";
import OpenAI from "openai";

/**
 * Live AI Agent для нарад. Аналізує НОВИЙ фрагмент транскрипту (chunk)
 * у контексті останніх кількох хвилин та повертає масив інсайтів —
 * ризики, питання, action items.
 *
 * Provider abstraction: для MVP — OpenAI (GPT-4o-mini за замовчуванням),
 * Anthropic Claude і Gemini додасть пізніше через спільний інтерфейс
 * `analyzeChunk()`. Перемикання — через env LIVE_AGENT_PROVIDER.
 */

export type InsightCategory =
  | "legal_risk"
  | "financial_risk"
  | "construction_risk"
  | "deadline_risk"
  | "missing_information"
  | "suggested_question"
  | "action_item"
  | "important_decision"
  | "contract_related"
  | "estimate_related";

export type InsightPriority = "low" | "medium" | "high" | "critical";

export type ResponseTone = "formal" | "neutral" | "firm";

export type SuggestedResponse = {
  tone: ResponseTone;
  text: string;
};

export type LiveTerm = {
  term: string;
  definition: string;
  contextInMeeting: string | null;
};

export type LiveInsight = {
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  summary: string;
  suggestedQuestion: string | null;
  actionItem: string | null;
  /** Якщо до користувача звернулись питанням — варіанти відповіді (0-3). */
  suggestedResponses: SuggestedResponse[] | null;
  confidence: number;
};

export type ProjectFileExcerpt = {
  fileName: string;
  content: string;
  similarity: number;
};

export type AnalyzeInput = {
  /** Свіжий шматок транскрипту що щойно зʼявився. */
  currentChunk: string;
  /** Стислий контекст останніх 3-5 хвилин (зменшує дублі). */
  recentContext?: string | null;
  /** Метадані наради — назва, проєкт, опис. */
  meetingMetadata?: {
    title?: string | null;
    description?: string | null;
    projectTitle?: string | null;
  };
  /** Останні 5-10 уже виданих інсайтів — щоб не повторюватись. */
  previousInsights?: Array<{
    title: string;
    category: string;
    priority: string;
  }>;
  /** RAG: релевантні фрагменти з проєктних файлів (геодезія, специфікації,
   * контракти, фото-описи). Витягуються через ragSearch у роуті /analyze. */
  projectFiles?: ProjectFileExcerpt[];
};

export type LookupEntityType =
  | "project"
  | "counterparty"
  | "person"
  | "object"
  | "document"
  | "material"
  | "location"
  | "other";

export type EntityToLookup = {
  type: LookupEntityType;
  text: string;
};

export type CoachTone =
  | "neutral"
  | "constructive"
  | "tense"
  | "evasive"
  | "pressuring"
  | "friendly"
  | "hostile";

export type CoachHints = {
  /** Як зараз йде розмова (загальна оцінка). */
  tone: CoachTone;
  /** Знайдені маніпуляції / переговорні прийоми (порожній масив якщо немає). */
  manipulations: Array<{
    type: string; // "штучна терміновість" | "anchoring" | "false dilemma" | ...
    evidence: string; // цитата або переказ що саме сказали
    counter: string; // як відповідати щоб не вестись
  }>;
  /** Короткі тактичні поради — як вести діалог далі (1-3 шт). */
  tips: string[];
};

export type AnalyzeResult = {
  insights: LiveInsight[];
  /** Нові терміни / абревіатури з пояснень — для live-глосарію. */
  glossaryTerms: LiveTerm[];
  /** Іменовані сутності з chunk-у, які варто пошукати у власній базі. */
  entitiesToLookup: EntityToLookup[];
  /** Психологічно-тактичний аналіз для вкладки «Психолог». */
  coachHints: CoachHints;
  /** Метадані для cost-логу. */
  usage: {
    provider: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostUsd: number | null;
    latencyMs: number;
  };
};

const SYSTEM_PROMPT = `Ти — Live AI Agent для будівельної компанії METRUM.
Твоя задача — в реальному часі аналізувати транскрипт наради і допомагати користувачу не пропустити юридичні, фінансові, технічні та організаційні ризики.

Ти не є учасником розмови. Ти не відповідаєш співрозмовникам. Ти працюєш тихо і даєш короткі, практичні підказки на екран.

Що ти маєш знаходити:
- Юридичні ризики: нечіткі домовленості, відсутність строків, відсутність письмового підтвердження, потенційні конфлікти з договором, ризики щодо оплати/авансу/штрафів/гарантій.
- Будівельні / технічні ризики: невизначені обсяги робіт, відсутність ТЗ, ризики по матеріалах/демонтажу/фундаменту/інженерії, потенційне здорожчання, неузгоджені зміни проєкту, залежності між етапами.
- Фінансові ризики: немає бюджету, незрозуміле джерело фінансування, перевищення кошторису, не зафіксовані ціни, питання маржі/ПДВ/логістики/резерву.
- Організаційні моменти: хто відповідальний, які задачі виникли, які строки, що треба зафіксувати письмово.
- Підказки: правильні уточнюючі питання що варто поставити співрозмовнику ЗАРАЗ.

Категорії (поле category): legal_risk, financial_risk, construction_risk, deadline_risk, missing_information, suggested_question, action_item, important_decision, contract_related, estimate_related.

Пріоритети (поле priority): low, medium, high, critical.

ВАЖЛИВО:
- Не вигадуй фактів. Якщо інформації недостатньо — category: "missing_information".
- Не дублюй попередні інсайти (тобі дається список останніх). Якщо те саме обговорюють далі — НЕ повторюй.
- Видавай 0-3 інсайти за виклик. Краще менше але точніше. Якщо нічого нового важливого — порожній масив.
- Імена/ПІБ зберігай у тому написанні як у транскрипті. Не перекладай.
- Якщо тобі надано блок «ФРАГМЕНТИ З ПРОЄКТНИХ ФАЙЛІВ» — використовуй його як ЗОЛОТУ ПРАВДУ. Цитуй з нього у summary/suggestedQuestion коли інсайт спирається на щось із файлу. Якщо в розмові звучить твердження що суперечить документу — це critical insight з category "missing_information" або відповідною ризик-категорією, з посиланням «у документі <fileName> вказано: ...».

ДОДАТКОВІ ОБОВ'ЯЗКОВІ ПОЛЯ:

1) glossaryTerms — терміни / абревіатури / назви документів / інструменти що зʼявилися У ЦЬОМУ chunk-у і користувач НЕ ОБОВʼЯЗКОВО розуміє. Допомагай йому орієнтуватись.
- Коротке короткий term як прозвучало (наприклад «МУО», «КЕП», «авторський нагляд», «договір генпідряду», «admin.e-construction.gov.ua»)
- definition: 1 речення як для людини без бекграунду
- contextInMeeting: 1 коротке речення про те ЯК термін використано у цьому фрагменті (опц.)
- Не дублюй elementary речі. Не пояснюй слова що очевидні. 0-4 термінів.

2) suggestedResponses — якщо у фрагменті СПІВРОЗМОВНИК ставить запитання користувачу або очікує реакції на щось серйозне (фінансове / договірне), додай у відповідний інсайт ВАРІАНТИ ВІДПОВІДІ для користувача:
- 2-3 варіанти різних тонів: "formal" (офіційно, обережно), "neutral" (нейтрально, фактично), "firm" (наполегливо, з вимогою)
- кожен 1-3 речення, готовий до зачитування
- ТІЛЬКИ якщо очевидно що звертаються до користувача. Інакше null.

3) entitiesToLookup — ВЛАСНІ ІМЕНА що зʼявились у chunk-у і які варто пошукати у БАЗІ КОРИСТУВАЧА (попередні наради, проєкти, контрагенти, обʼєкти, документи).
- type: "project"|"counterparty"|"person"|"object"|"document"|"material"|"location"|"other"
- text: ТОЧНО як прозвучало (не виправляй, не перекладай)
- Не дублюй terms. Імена людей — тільки якщо хтось зовнішній/контрагент.
- 0-5 елементів.

4) coachHints — ПСИХОЛОГІЧНО-ТАКТИЧНИЙ АНАЛІЗ розмови (це для окремої вкладки «Психолог»):
- tone: одне з "neutral"|"constructive"|"tense"|"evasive"|"pressuring"|"friendly"|"hostile" — як йде розмова ЗАГАЛОМ
- manipulations: список ВИЯВЛЕНИХ переговорних прийомів від співрозмовника (НЕ нашого користувача):
   * штучна терміновість («вирішуйте сьогодні», «це єдиний шанс»)
   * anchoring (підкидання нереалістичної першої цифри щоб «згладити» реальну)
   * false dilemma («або X або нічого»)
   * appeal to authority / sunk cost / foot-in-door / FOMO / guilt-tripping / gaslighting
   * нечіткі формулювання що звʼяжуть зобовʼязаннями
   * Для кожної: {type, evidence (цитата/переказ), counter (як відповідати щоб не вестись, 1-2 речення)}
   * Якщо нічого не виявлено — порожній масив
- tips: 1-3 короткі тактичні поради як ВЕСТИ ДІАЛОГ ДАЛІ. Приклади:
   * «Не давай прямих обіцянок поки не маєш всіх цифр — пиши «перевірю і дам відповідь»»
   * «Тон співрозмовника напружений — знизь темп, повернись до спільних інтересів»
   * «Час пере-перевести розмову на конкретні строки і відповідальних»
   * «Перепитай ціну явно — нечіткість грає проти тебе»

Формат відповіді: ВИКЛЮЧНО JSON {"insights": [...], "glossaryTerms": [...], "entitiesToLookup": [...], "coachHints": {tone, manipulations, tips}}. Без markdown, без пояснень поза JSON.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "legal_risk",
              "financial_risk",
              "construction_risk",
              "deadline_risk",
              "missing_information",
              "suggested_question",
              "action_item",
              "important_decision",
              "contract_related",
              "estimate_related",
            ],
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          title: { type: "string" },
          summary: { type: "string" },
          suggestedQuestion: { type: ["string", "null"] },
          actionItem: { type: ["string", "null"] },
          suggestedResponses: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                tone: {
                  type: "string",
                  enum: ["formal", "neutral", "firm"],
                },
                text: { type: "string" },
              },
              required: ["tone", "text"],
            },
          },
          confidence: { type: "number" },
        },
        required: [
          "category",
          "priority",
          "title",
          "summary",
          "suggestedQuestion",
          "actionItem",
          "suggestedResponses",
          "confidence",
        ],
      },
    },
    glossaryTerms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          term: { type: "string" },
          definition: { type: "string" },
          contextInMeeting: { type: ["string", "null"] },
        },
        required: ["term", "definition", "contextInMeeting"],
      },
    },
    entitiesToLookup: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: [
              "project",
              "counterparty",
              "person",
              "object",
              "document",
              "material",
              "location",
              "other",
            ],
          },
          text: { type: "string" },
        },
        required: ["type", "text"],
      },
    },
    coachHints: {
      type: "object",
      additionalProperties: false,
      properties: {
        tone: {
          type: "string",
          enum: [
            "neutral",
            "constructive",
            "tense",
            "evasive",
            "pressuring",
            "friendly",
            "hostile",
          ],
        },
        manipulations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string" },
              evidence: { type: "string" },
              counter: { type: "string" },
            },
            required: ["type", "evidence", "counter"],
          },
        },
        tips: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["tone", "manipulations", "tips"],
    },
  },
  required: [
    "insights",
    "glossaryTerms",
    "entitiesToLookup",
    "coachHints",
  ],
} as const;

// Дуже груба оцінка вартості GPT-4o-mini ($0.15 / 1M input, $0.60 / 1M output).
// Інші моделі додамо коли підключимо.
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "gpt-4o": { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  "gpt-4.1-mini": { input: 0.4 / 1_000_000, output: 1.6 / 1_000_000 },
};

function estimateCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const rate = PRICING[model];
  if (!rate || inputTokens == null || outputTokens == null) return null;
  return inputTokens * rate.input + outputTokens * rate.output;
}

export async function analyzeChunk(
  input: AnalyzeInput,
): Promise<AnalyzeResult> {
  const provider = process.env.LIVE_AGENT_PROVIDER || "openai";
  if (provider !== "openai") {
    // Stub для майбутнього Claude/Gemini.
    throw new Error(
      `Live agent provider "${provider}" поки не реалізовано. Використай openai.`,
    );
  }
  const model = process.env.LIVE_AGENT_MODEL || "gpt-4o-mini";

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY не налаштований для Live Agent");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userPayload = buildUserPrompt(input);

  const start = Date.now();
  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "live_insights",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
    // Trim — Live режим має бути дешевим.
    max_tokens: 800,
    temperature: 0.3,
  });
  const latencyMs = Date.now() - start;

  const raw =
    res.choices[0]?.message?.content ??
    '{"insights":[],"glossaryTerms":[],"entitiesToLookup":[],"coachHints":{"tone":"neutral","manipulations":[],"tips":[]}}';
  let parsed: {
    insights?: LiveInsight[];
    glossaryTerms?: LiveTerm[];
    entitiesToLookup?: EntityToLookup[];
    coachHints?: CoachHints;
  } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const insights = Array.isArray(parsed.insights) ? parsed.insights : [];
  const glossaryTerms = Array.isArray(parsed.glossaryTerms)
    ? parsed.glossaryTerms
    : [];
  const entitiesToLookup = Array.isArray(parsed.entitiesToLookup)
    ? parsed.entitiesToLookup
    : [];
  const coachHints: CoachHints = parsed.coachHints ?? {
    tone: "neutral",
    manipulations: [],
    tips: [],
  };

  const inputTokens = res.usage?.prompt_tokens ?? null;
  const outputTokens = res.usage?.completion_tokens ?? null;
  const estimatedCostUsd = estimateCost(model, inputTokens, outputTokens);

  return {
    insights,
    glossaryTerms,
    entitiesToLookup,
    coachHints,
    usage: {
      provider,
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      latencyMs,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pre-meeting briefing
// ────────────────────────────────────────────────────────────────────────

const BRIEFING_SYSTEM_PROMPT = `Ти — Chief of Staff у будівельній компанії METRUM. Готуєш для керівника 1-сторінкову довідку перед нарадою щоб він був у контексті навіть якщо тема для нього нова.

Давай документ у markdown що містить:

## Що цю нараду треба знати наперед
- 3-7 ключових фактів про проєкт/контрагента/тему

## На що звернути увагу
- 3-5 нюансів які зазвичай псують переговори у такому контексті

## Питання які варто поставити
- 3-5 уточнюючих питань, найкорисніших за поточних вхідних даних

## Терміни що можуть прозвучати
- список 5-10 термінів/абревіатур/документів які можуть зʼявитись (МУО, КЕП, ІПН, договір генпідряду, технагляд тощо), кожен з коротким поясненням

Пиши лаконічно, по справі. Українською. Без disclaimer-ів. Без вступу. Стартуй одразу з ## заголовка. Якщо вхідних даних обмаль — все одно підготуй на тому що є + здоровий глузд галузі.`;

export type GenerateBriefingInput = {
  title: string;
  description?: string | null;
  projectTitle?: string | null;
  projectAddress?: string | null;
  recentMeetings?: Array<{ title: string; summary?: string | null }>;
  openTasks?: Array<{ title: string; status?: string | null }>;
};

export async function generateBriefing(
  input: GenerateBriefingInput,
): Promise<{ briefing: string; usage: AnalyzeResult["usage"] }> {
  const provider = process.env.LIVE_AGENT_PROVIDER || "openai";
  if (provider !== "openai") {
    throw new Error(
      `Live agent provider "${provider}" поки не реалізовано. Використай openai.`,
    );
  }
  const model = process.env.LIVE_AGENT_MODEL || "gpt-4o-mini";
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY не налаштований");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const parts: string[] = [];
  parts.push(`НАРАДА: ${input.title}`);
  if (input.projectTitle) parts.push(`ПРОЄКТ: ${input.projectTitle}`);
  if (input.projectAddress) parts.push(`АДРЕСА: ${input.projectAddress}`);
  if (input.description) parts.push(`КОНТЕКСТ ВІД ОРГАНІЗАТОРА:\n${input.description}`);
  if (input.recentMeetings && input.recentMeetings.length > 0) {
    parts.push(
      `ОСТАННІ НАРАДИ ПО ПРОЄКТУ (для контексту):\n${input.recentMeetings
        .slice(0, 5)
        .map(
          (m, i) =>
            `  ${i + 1}. ${m.title}${m.summary ? " — " + m.summary.slice(0, 200) : ""}`,
        )
        .join("\n")}`,
    );
  }
  if (input.openTasks && input.openTasks.length > 0) {
    parts.push(
      `ВІДКРИТІ ЗАДАЧІ ПО ПРОЄКТУ:\n${input.openTasks
        .slice(0, 10)
        .map((t) => `  - ${t.title}${t.status ? " [" + t.status + "]" : ""}`)
        .join("\n")}`,
    );
  }

  const userMessage = parts.join("\n\n");

  const start = Date.now();
  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: BRIEFING_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 1200,
  });
  const latencyMs = Date.now() - start;

  const briefing = res.choices[0]?.message?.content?.trim() ?? "";
  const inputTokens = res.usage?.prompt_tokens ?? null;
  const outputTokens = res.usage?.completion_tokens ?? null;

  return {
    briefing,
    usage: {
      provider,
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      latencyMs,
    },
  };
}

function buildUserPrompt(input: AnalyzeInput): string {
  const parts: string[] = [];
  const m = input.meetingMetadata;
  if (m?.title) parts.push(`НАРАДА: ${m.title}`);
  if (m?.projectTitle) parts.push(`ПРОЄКТ: ${m.projectTitle}`);
  if (m?.description) parts.push(`КОНТЕКСТ ОРГАНІЗАТОРА: ${m.description}`);

  if (input.previousInsights && input.previousInsights.length > 0) {
    const lines = input.previousInsights
      .slice(-10)
      .map(
        (p) =>
          `  - [${p.priority}/${p.category}] ${p.title}`,
      )
      .join("\n");
    parts.push(`ПОПЕРЕДНІ ІНСАЙТИ (НЕ ДУБЛЮЙ):\n${lines}`);
  }

  if (input.recentContext) {
    parts.push(`КОНТЕКСТ ОСТАННІХ ХВИЛИН (для розуміння):\n${input.recentContext}`);
  }

  // RAG: проєктні файли (геодезія, специфікації, договори, фото-описи).
  // Це ЗОЛОТА правда для проєкту — цитуй дослівно якщо інсайт спирається
  // на щось із файлу. Не вигадуй те чого там нема.
  if (input.projectFiles && input.projectFiles.length > 0) {
    const lines = input.projectFiles
      .map(
        (f, i) =>
          `  [${i + 1}] (${f.fileName}, similarity ${f.similarity.toFixed(2)}):\n${f.content
            .replace(/\s+/g, " ")
            .slice(0, 800)}`,
      )
      .join("\n\n");
    parts.push(
      `ФРАГМЕНТИ З ПРОЄКТНИХ ФАЙЛІВ (RAG — semantic search по геодезії, специфікації, договорах):\n${lines}`,
    );
  }

  parts.push(
    `НОВИЙ ФРАГМЕНТ РОЗМОВИ (саме його аналізуй):\n${input.currentChunk}`,
  );
  parts.push(
    "Видай 0-3 НОВИХ інсайти на основі нового фрагменту. Якщо нічого важливого/нового — порожній масив insights.",
  );
  return parts.join("\n\n");
}

/**
 * Дедуп нового інсайту проти існуючих. Повертає `null` якщо це дубль,
 * або інсайт (можливо з підвищеним priority) якщо це нове.
 */
export function dedupeInsight(
  candidate: LiveInsight,
  existing: Array<{ title: string; category: string; priority: string }>,
): LiveInsight | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s\.,!\?…:;\-—\(\)«»"'`]+/g, " ")
      .trim();
  const candNorm = norm(candidate.title);
  for (const e of existing) {
    if (e.category !== candidate.category) continue;
    const existNorm = norm(e.title);
    // Якщо ≥70% спільних токенів — вважаємо дублем.
    const candTokens = new Set(candNorm.split(" ").filter(Boolean));
    const existTokens = new Set(existNorm.split(" ").filter(Boolean));
    const inter = [...candTokens].filter((t) => existTokens.has(t)).length;
    const ratio =
      inter / Math.max(1, Math.min(candTokens.size, existTokens.size));
    if (ratio >= 0.7) {
      // Якщо новий має вищий priority — все одно віддаємо, апер вважатиме як update
      const order = { low: 0, medium: 1, high: 2, critical: 3 } as const;
      if (
        order[candidate.priority] >
        order[e.priority as keyof typeof order]
      ) {
        return candidate;
      }
      return null;
    }
  }
  return candidate;
}

// ────────────────────────────────────────────────────────────────────────
// Free-form чат з агентом — окрема вкладка «Чат». Юзер питає текстом,
// агент має повний контекст наради: транскрипт, останні інсайти, RAG-
// фрагменти з проєктних файлів. Відповідає коротко і по справі.
// ────────────────────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `Ти — Live AI Agent у будівельній компанії METRUM, асистент керівника під час ділової наради. У цьому режимі ти не аналізуєш кожен chunk автоматично — ти відповідаєш на КОНКРЕТНИЙ запит юзера від першої особи.

Контекст який маєш:
- транскрипт розмови що йде ЗАРАЗ (до моменту запиту)
- останні інсайти/ризики які ти ж і витяг
- фрагменти з проєктних файлів (RAG: геодезія, специфікації, договори)
- історія чату користувача з тобою у межах цієї наради

Відповідай:
- Українською (імена/ПІБ — в оригінальному написанні як у транскрипті)
- Коротко, по справі (3-8 речень як правило, без води)
- Конкретно: якщо є дані у файлах — цитуй, якщо ні — чесно скажи що не знаєш
- НЕ вигадуй фактів. Якщо інформації недостатньо — «у відомих мені даних цього немає, варто уточнити в [...]»
- Без markdown-обгортки, без префіксів типу «Відповідь:»`;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatInput = {
  userMessage: string;
  /** Поточна історія чату (не включаючи нове userMessage). */
  history?: ChatMessage[];
  meetingMetadata?: {
    title?: string | null;
    description?: string | null;
    projectTitle?: string | null;
  };
  /** Останні N speakers/turns транскрипту (стиснуто). */
  transcriptSnippet?: string | null;
  /** Останні інсайти що агент уже витяг. */
  recentInsights?: Array<{
    category: string;
    priority: string;
    title: string;
    summary: string;
  }>;
  /** RAG-фрагменти з проєктних файлів по семантичному пошуку з userMessage. */
  projectFiles?: ProjectFileExcerpt[];
};

export async function chatWithAgent(
  input: ChatInput,
): Promise<{ reply: string; usage: AnalyzeResult["usage"] }> {
  const model = process.env.LIVE_AGENT_MODEL || "gpt-4o-mini";
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY не налаштовано");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const ctxParts: string[] = [];
  const m = input.meetingMetadata;
  if (m?.title) ctxParts.push(`Нарада: ${m.title}`);
  if (m?.projectTitle) ctxParts.push(`Проєкт: ${m.projectTitle}`);
  if (m?.description) ctxParts.push(`Контекст організатора: ${m.description}`);
  if (input.transcriptSnippet) {
    ctxParts.push(
      `Останній транскрипт розмови:\n${input.transcriptSnippet.slice(-4000)}`,
    );
  }
  if (input.recentInsights && input.recentInsights.length > 0) {
    const lines = input.recentInsights
      .slice(-10)
      .map(
        (i) =>
          `  - [${i.priority}/${i.category}] ${i.title} — ${i.summary.slice(0, 200)}`,
      )
      .join("\n");
    ctxParts.push(`Останні інсайти що ти витяг:\n${lines}`);
  }
  if (input.projectFiles && input.projectFiles.length > 0) {
    const lines = input.projectFiles
      .map(
        (f, i) =>
          `  [${i + 1}] (${f.fileName}, similarity ${f.similarity.toFixed(2)}):\n${f.content
            .replace(/\s+/g, " ")
            .slice(0, 800)}`,
      )
      .join("\n\n");
    ctxParts.push(
      `Фрагменти з проєктних файлів (RAG):\n${lines}`,
    );
  }

  const contextMessage = ctxParts.length > 0 ? ctxParts.join("\n\n") : "";

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: CHAT_SYSTEM_PROMPT }];
  if (contextMessage) {
    messages.push({
      role: "system",
      content: `КОНТЕКСТ НАРАДИ:\n${contextMessage}`,
    });
  }
  for (const m of input.history ?? []) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: input.userMessage });

  const start = Date.now();
  const res = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0.4,
    max_tokens: 600,
  });
  const latencyMs = Date.now() - start;

  const reply = res.choices[0]?.message?.content?.trim() ?? "";
  const inputTokens = res.usage?.prompt_tokens ?? null;
  const outputTokens = res.usage?.completion_tokens ?? null;

  return {
    reply,
    usage: {
      provider: "openai",
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      latencyMs,
    },
  };
}
