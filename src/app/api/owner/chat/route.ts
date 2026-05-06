import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { TOOLS, dispatchTool } from "@/lib/owner/ai-tools";
import { EXTRA_TOOLS, dispatchExtraTool } from "@/lib/owner/ai-tools-extra";
import { WRITE_TOOLS, dispatchWriteTool } from "@/lib/owner/ai-tools-write";
import { KNOWN_FIRMS } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AttachmentSchema = z.object({
  type: z.enum(["image", "document"]), // image (jpeg/png/webp/gif) | document (PDF)
  mediaType: z.string(),
  /** Base64-encoded data WITHOUT data: prefix. */
  base64: z.string(),
  /** Original filename — для контексту. */
  name: z.string().optional(),
});

const Body = z.object({
  conversationId: z.string().optional(),
  thinking: z.boolean().optional().default(false),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        /** Attachments — тільки на user повідомленнях. */
        attachments: z.array(AttachmentSchema).max(5).optional(),
      }),
    )
    .min(1)
    .max(40),
});

const MODEL = "claude-sonnet-4-5-20250929"; // Sonnet 4.6 під одним з aliases

const SYSTEM_PROMPT = (firmId: string | null, today: string) => `Ти — фінансовий асистент директора будівельної компанії «Metrum».

# Твоя роль
Допомагаєш власнику бізнесу швидко знаходити відповіді у фінансовій системі. Користувач — директор, він хоче бачити не сирі дані, а продуманий аналіз: суми, тренди, попередження.

# Контекст
- Сьогодні: ${today}
- Активна фірма: ${firmId ? KNOWN_FIRMS[firmId]?.name : "Усі (cross-firm view)"}
- Усі грошові суми — у гривнях (UAH).

# Доступні tools
- **Read tools** (query_*, search_*, forecast_*) — читання фінансів, проектів, кошторисів, ЗП, контрагентів, задач, файлів.
- **Write tools** (create_task_draft, create_reminder) — обережно. Створюй ЛИШЕ якщо власник явно просить ('постав задачу X', 'нагадай мені Y'). Завжди підтверджуй коротко що створив.
- **web_search** — для актуальних ринкових даних: курси НБУ, ціни матеріалів, тендери Prozorro, новини індустрії. НЕ використовуй для внутрішніх даних.

# Принципи відповіді
1. **Завжди користуйся tools** для фактичних даних. НЕ вигадуй цифри.
2. Відповідай по-українськи, **коротко і структуровано**: підзаголовки, маркдаун-таблиці, виділення жирним.
3. Якщо tool повертає таблицю у markdown — **скопіюй її ВЕРБАТИМ**, разом з усіма \\n між рядками.
4. Після таблиці додавай 1-2 речення інсайту: тренд / попередження / рекомендацію.
5. Якщо запит неоднозначний — попроси уточнення (наприклад «який період?», «який конкретний проект?»).
6. Якщо користувач питає про період без дати — припускай **поточний місяць**.
7. Можеш викликати кілька tools у одному turn — наприклад спочатку знайти проект, потім зробити прогноз.

# КРИТИЧНО: формат markdown таблиць
Кожен рядок таблиці МАЄ бути на окремому рядку (з \\n). НЕ збивай таблицю у один рядок!

ПРАВИЛЬНО:
\`\`\`
| Назва | Сума |
|---|---:|
| Перший | 100 |
| Другий | 200 |
\`\`\`

НЕПРАВИЛЬНО (так зламається рендер):
\`\`\`
| Назва | Сума | |---|---:| | Перший | 100 | | Другий | 200 |
\`\`\`

Між header row, delimiter row (|---|---|) і кожним data row ОБОВ'ЯЗКОВО має бути перенос рядка. Коли копіюєш таблицю з tool result — НЕ зливай рядки в один.

# Графіки
Коли результат добре візуалізується (тренд за час, порівняння категорій, частки) — додавай графік у відповідь fenced-кодом з мовою \`chart-bar\`, \`chart-line\` або \`chart-pie\`. Формат:

\`\`\`chart-bar
{
  "title": "Витрати по категоріях",
  "data": [
    {"name": "Матеріали", "value": 45000},
    {"name": "Робота", "value": 32000}
  ],
  "valueLabel": "грн"
}
\`\`\`

Для chart-line додавай \`xKey\` (зазвичай "name" або "date") + multiple value series:
\`\`\`chart-line
{
  "title": "Витрати по місяцях",
  "data": [
    {"month": "Січ", "plan": 100000, "fact": 95000},
    {"month": "Лют", "plan": 120000, "fact": 130000}
  ],
  "xKey": "month",
  "series": [
    {"key": "plan", "label": "План", "color": "#60a5fa"},
    {"key": "fact", "label": "Факт", "color": "#f87171"}
  ]
}
\`\`\`

Для chart-pie — той самий формат що bar, але показує частки.

**Не зловживай графіками** — додавай тільки коли > 3 точок даних і дійсно покращує сприйняття.

# Follow-up пропозиції
Після КОЖНОЇ змістовної відповіді (не уточнення/помилка) додавай у самому кінці fenced-блок з мовою \`suggestions\` — JSON-масив 2-4 коротких follow-up запитань. Це конкретні дії що логічно випливають з поточної відповіді (продовжити аналіз, поглянути іншим зрізом, спрогнозувати тощо).

ПРАВИЛЬНО:
\`\`\`suggestions
[
  "Спрогнозуй чи вистачить бюджету у Тіфані",
  "Покажи витрати по місяцях графіком",
  "Порівняй з минулим кварталом"
]
\`\`\`

ПРАВИЛА:
- Кожна пропозиція 30-70 символів, жодних емоджі/префіксів.
- НЕ повторюй те що вже зробив. Пропонуй наступний крок.
- Якщо нічого розумного запропонувати (наприклад просте уточнення) — НЕ додавай блок взагалі.
- Не додавай блок при помилках чи коли запит був не до даних компанії.

# Citations / посилання на проекти
Коли згадуєш конкретний проект у тексті відповіді (поза таблицями), ВИДІЛЯЙ його у markdown-link форматі для drill-in:
\`[Назва проекту](/owner/projects?q=Назва%20проекту)\`

Приклад: «Найбільша перевитрата у [Квартирі 192](/owner/projects?q=%D0%9A%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D0%B0%20192) — на 280 тис.»

Це дозволяє власнику ткнути на назву і провалитись у деталі. У таблицях — НЕ роби посилання (вони ламають форматування).

# Стиль
- Формально-дружній, як консультант на нараді.
- Без емоджі (крім ⚠️ для попереджень і ✓ для confirmation).
- Цифри виділяй **жирним** для ключових сум.
`;

export async function POST(req: NextRequest) {
  // Auth
  let session, firmId;
  try {
    ({ session, firmId } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return new Response("Bad request", { status: 400 });
  }

  // Validate conversationId якщо передано — ownership check
  let conversationId: string | null = null;
  if (parsed.data.conversationId) {
    const conv = await prisma.ownerConversation.findFirst({
      where: { id: parsed.data.conversationId, userId: session.user.id },
      select: { id: true },
    });
    if (conv) conversationId = conv.id;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const today = new Date().toISOString().slice(0, 10);

  // Останнє user повідомлення — для збереження
  const lastUserMessage = [...parsed.data.messages].reverse().find((m) => m.role === "user");
  // Зберігаємо user повідомлення одразу (щоб з'явилось у DB до того як AI почне відповідати)
  if (conversationId && lastUserMessage) {
    await prisma.ownerChatMessage.create({
      data: { conversationId, role: "user", content: lastUserMessage.content },
    });
    await prisma.ownerConversation.update({
      where: { id: conversationId },
      data: { messageCount: { increment: 1 }, updatedAt: new Date() },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let assistantTextBuffer = "";
      const toolCallsLog: Array<{ name: string; result?: string; server?: boolean }> = [];

      try {
        type AnyMsg = Anthropic.Messages.MessageParam;
        // Перетворюємо messages — для останнього user-повідомлення з attachments
        // створюємо multimodal content array (text + image/document blocks).
        const inputMessages = parsed.data.messages;
        const messages: AnyMsg[] = inputMessages.map((m, idx) => {
          const isLast = idx === inputMessages.length - 1;
          if (m.role === "user" && isLast && m.attachments && m.attachments.length > 0) {
            type Block =
              | { type: "text"; text: string }
              | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
              | { type: "document"; source: { type: "base64"; media_type: string; data: string } };
            const blocks: Block[] = [];
            for (const att of m.attachments) {
              if (att.type === "image") {
                blocks.push({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: att.mediaType,
                    data: att.base64,
                  },
                });
              } else if (att.type === "document") {
                blocks.push({
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: att.mediaType,
                    data: att.base64,
                  },
                });
              }
            }
            blocks.push({ type: "text", text: m.content });
            return { role: m.role, content: blocks } as unknown as AnyMsg;
          }
          return { role: m.role, content: m.content };
        });

        // Tool loop — до 5 ітерацій (захист від нескінченного циклу)
        for (let iter = 0; iter < 5; iter++) {
          send("status", { phase: "thinking", iteration: iter });

          // Tools = core (TOOLS) + extras (Phase A) + Anthropic web_search.
          const allTools = [
            ...(TOOLS as unknown as Anthropic.Messages.Tool[]),
            ...(EXTRA_TOOLS as unknown as Anthropic.Messages.Tool[]),
            ...(WRITE_TOOLS as unknown as Anthropic.Messages.Tool[]),
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5,
            } as unknown as Anthropic.Messages.Tool,
          ];

          const apiParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
            model: MODEL,
            max_tokens: parsed.data.thinking ? 16000 : 4096,
            system: SYSTEM_PROMPT(firmId, today),
            tools: allTools,
            messages,
          };

          // Extended thinking — для складних аналітичних запитів власник
          // вмикає toggle "Глибокий аналіз". Claude думає до 8000 токенів
          // перед відповіддю — для прогнозів, мульти-проектних аналізів.
          if (parsed.data.thinking) {
            (apiParams as unknown as Record<string, unknown>).thinking = {
              type: "enabled",
              budget_tokens: 8000,
            };
          }

          const response = await anthropic.messages.create(apiParams);

          // Stream text from response.content
          for (const block of response.content) {
            if (block.type === "text") {
              send("text", { delta: block.text });
              assistantTextBuffer += block.text;
            } else if (block.type === "tool_use") {
              send("tool_call", { name: block.name, input: block.input });
              toolCallsLog.push({ name: block.name });
            } else if ((block as { type: string }).type === "server_tool_use") {
              const b = block as unknown as { name: string; input: unknown };
              send("tool_call", { name: b.name, input: b.input, server: true });
              toolCallsLog.push({ name: b.name, server: true });
            } else if ((block as { type: string }).type === "web_search_tool_result") {
              send("tool_result", { name: "web_search", result: "✓ пошук в інтернеті завершено" });
              const last = toolCallsLog[toolCallsLog.length - 1];
              if (last && last.name === "web_search") last.result = "✓";
            } else if ((block as { type: string }).type === "thinking") {
              // Розширене thinking — пропускаємо у відповідь користувачу
              // (Claude думає мовчки), не зберігаємо у БД.
            }
          }

          // If model didn't request any tools, we're done
          if (response.stop_reason !== "tool_use") {
            break;
          }

          // Append assistant turn (text + tool_use blocks) to messages
          messages.push({
            role: "assistant",
            content: response.content,
          });

          // Execute each tool_use and accumulate tool_result blocks
          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            // Маршрутизація: write tools → extras → core. Перший що поверне non-null — переможець.
            let result = await dispatchWriteTool(
              { firmId, ownerUserId: session.user.id },
              block.name,
              block.input,
            );
            if (result === null) {
              result = await dispatchExtraTool({ firmId }, block.name, block.input);
            }
            if (result === null) {
              result = await dispatchTool({ firmId }, block.name, block.input);
            }
            send("tool_result", { name: block.name, result });
            // Update last matching tool in log
            for (let i = toolCallsLog.length - 1; i >= 0; i--) {
              if (toolCallsLog[i].name === block.name && !toolCallsLog[i].result) {
                toolCallsLog[i].result = result.slice(0, 4000); // cap
                break;
              }
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
          messages.push({ role: "user", content: toolResults });
        }

        // Зберегти assistant повідомлення у БД
        if (conversationId && assistantTextBuffer.trim().length > 0) {
          await prisma.ownerChatMessage.create({
            data: {
              conversationId,
              role: "assistant",
              content: assistantTextBuffer,
              toolCallsJson:
                toolCallsLog.length > 0
                  ? (toolCallsLog as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
            },
          });
          await prisma.ownerConversation.update({
            where: { id: conversationId },
            data: {
              messageCount: { increment: 1 },
              updatedAt: new Date(),
              // Auto-title з першого user повідомлення (якщо ще "Нова розмова")
              title:
                lastUserMessage && parsed.data.messages.length <= 2
                  ? lastUserMessage.content.slice(0, 80)
                  : undefined,
            },
          });
        }

        send("done", { ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("[owner/chat] error:", message);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
