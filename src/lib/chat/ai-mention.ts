import { getOrCreateAiBotUser, parseAiMentionPrompt } from "@/lib/chat/ai-bot";
import { runAiReply } from "@/lib/chat/ai-run";

/**
 * Fire-and-forget handler: if the message tags "@ai", publish an AI reply
 * in the same thread using the default GPT-4o model. Explicit model
 * selection goes through /api/admin/chat/conversations/[id]/ai-invoke.
 */
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
    if (opts.authorId === bot.id) return;

    await runAiReply({
      conversationId: opts.conversationId,
      prompt,
      model: "gpt-4o",
    });
  } catch (err) {
    console.error("[ai-mention] handler failed:", err);
  }
}
