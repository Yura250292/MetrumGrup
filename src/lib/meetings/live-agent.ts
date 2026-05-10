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

export type LiveInsight = {
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  summary: string;
  suggestedQuestion: string | null;
  actionItem: string | null;
  confidence: number;
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
};

export type AnalyzeResult = {
  insights: LiveInsight[];
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

Формат відповіді: ВИКЛЮЧНО JSON виду {"insights": [...]}. Без markdown, без пояснень поза JSON.`;

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
          confidence: { type: "number" },
        },
        required: [
          "category",
          "priority",
          "title",
          "summary",
          "suggestedQuestion",
          "actionItem",
          "confidence",
        ],
      },
    },
  },
  required: ["insights"],
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

  const raw = res.choices[0]?.message?.content ?? '{"insights":[]}';
  let parsed: { insights?: LiveInsight[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { insights: [] };
  }
  const insights = Array.isArray(parsed.insights) ? parsed.insights : [];

  const inputTokens = res.usage?.prompt_tokens ?? null;
  const outputTokens = res.usage?.completion_tokens ?? null;
  const estimatedCostUsd = estimateCost(model, inputTokens, outputTokens);

  return {
    insights,
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
