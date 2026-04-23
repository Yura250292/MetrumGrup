import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getOrCreateAiBotUser, parseAiMentionPrompt } from "@/lib/chat/ai-bot";
import { buildConversationAiContext } from "@/lib/chat/ai-context";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

const MAX_REPLY_TOKENS = 800;

const SYSTEM_PROMPT = `Ти AI-асистент у корпоративному чаті Metrum Group (будівельна компанія).
Відповідай українською, стисло й по ділу. Використовуй наданий контекст:
- Recent chat messages (із позначками автора).
- Витягнутий текст файлів з чату (PDF / TXT / DOC): позначений "=== ФАЙЛ: … ===" / "=== PDF: … ===".
- Транскрипти аудіо: позначені "=== АУДІО-ТРАНСКРИПТ: … ===".
- Зображення — доступні тобі як vision input поряд з цим текстом.

Коли користувач просить проаналізувати документ (наприклад договір):
- Розкладай по пунктам.
- Виділяй ризики, зобов'язання, дедлайни, суми, штрафи, умови виходу.
- Уточнюй якщо запит неясний.

НЕ вигадуй факти, яких немає в контексті чи документах. Якщо чогось не бачиш — чітко скажи.`;

export async function handleAiMention(opts: {
  conversationId: string;
  authorId: string;
  body: string;
}): Promise<void> {
  const prompt = parseAiMentionPrompt(opts.body);
  if (!prompt) return;
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[ai-mention] OPENAI_API_KEY not set; skipping");
    return;
  }

  try {
    const bot = await getOrCreateAiBotUser();

    // Skip if the triggering message is itself the AI bot's reply.
    if (opts.authorId === bot.id) return;

    const ctx = await buildConversationAiContext(opts.conversationId, bot.id, {
      messageLimit: 20,
    });

    const contextBlock = ctx.notes.length
      ? `${ctx.transcript}\n\n[Службові примітки щодо контексту:\n${ctx.notes.join("\n")}]`
      : ctx.transcript;

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `Контекст останніх повідомлень та файлів у чаті:\n\n${contextBlock}\n\n---\nПоточний запит до тебе: ${prompt}`,
      },
      ...ctx.images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img.url },
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.35,
      max_tokens: MAX_REPLY_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!reply) return;

    await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          conversationId: opts.conversationId,
          authorId: bot.id,
          body: reply,
        },
      }),
      prisma.conversation.update({
        where: { id: opts.conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } catch (err) {
    console.error("[ai-mention] handler failed:", err);
  }
}
