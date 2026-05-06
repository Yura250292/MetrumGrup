import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { TOOLS, dispatchTool } from "@/lib/owner/ai-tools";
import { KNOWN_FIRMS } from "@/lib/firm/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
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

# Принципи відповіді
1. **Завжди користуйся tools** для фактичних даних. НЕ вигадуй цифри.
2. Відповідай по-українськи, **коротко і структуровано**: підзаголовки, маркдаун-таблиці, виділення жирним.
3. Якщо tool повертає таблицю — **показуй її** користувачу як є (markdown tables рендеряться).
4. Після таблиці додавай 1-2 речення інсайту: тренд / попередження / рекомендацію.
5. Якщо запит неоднозначний — попроси уточнення (наприклад «який період?», «який конкретний проект?»).
6. Якщо користувач питає про період без дати — припускай **поточний місяць**.
7. Можеш викликати кілька tools у одному turn — наприклад спочатку знайти проект, потім зробити прогноз.

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
  void session; // tracking only — не використовуємо в логіці

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return new Response("Bad request", { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const today = new Date().toISOString().slice(0, 10);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Anthropic message conversation z tools loop
        type AnyMsg = Anthropic.Messages.MessageParam;
        const messages: AnyMsg[] = parsed.data.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Tool loop — до 5 ітерацій (захист від нескінченного циклу)
        for (let iter = 0; iter < 5; iter++) {
          send("status", { phase: "thinking", iteration: iter });

          const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT(firmId, today),
            tools: TOOLS as unknown as Anthropic.Messages.Tool[],
            messages,
          });

          // Stream text from response.content
          for (const block of response.content) {
            if (block.type === "text") {
              send("text", { delta: block.text });
            } else if (block.type === "tool_use") {
              send("tool_call", { name: block.name, input: block.input });
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
            const result = await dispatchTool({ firmId }, block.name, block.input);
            send("tool_result", { name: block.name, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
          messages.push({ role: "user", content: toolResults });
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
