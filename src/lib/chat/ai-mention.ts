import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getOrCreateAiBotUser, parseAiMentionPrompt } from "@/lib/chat/ai-bot";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

const CONTEXT_MESSAGES = 20;
const MAX_REPLY_TOKENS = 600;

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
    // Load last N messages for context (including the one that triggered this).
    const recent = await prisma.chatMessage.findMany({
      where: { conversationId: opts.conversationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_MESSAGES,
      include: { author: { select: { id: true, name: true } } },
    });
    recent.reverse(); // chronological

    const bot = await getOrCreateAiBotUser();

    // Skip if the message we're reacting to is itself from the AI bot, to
    // avoid infinite loops when the bot quotes @ai in its reply.
    if (opts.authorId === bot.id) return;

    const transcript = recent
      .map((m) => {
        const name = m.author?.id === bot.id ? "AI" : m.author?.name ?? "Користувач";
        return `${name}: ${m.body?.trim() || "[вкладення]"}`;
      })
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: MAX_REPLY_TOKENS,
      messages: [
        {
          role: "system",
          content:
            "Ти AI-асистент у корпоративному чаті Metrum Group (будівельна компанія). Відповідай українською, стисло і по ділу. Використовуй контекст останніх повідомлень. Якщо запит неясний — попроси уточнення. Не вигадуй факти про проекти/задачі чи конкретних людей, яких немає в контексті.",
        },
        {
          role: "user",
          content: `Останні повідомлення:\n${transcript}\n\nЗапит до тебе: ${prompt}`,
        },
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
