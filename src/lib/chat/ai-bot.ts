import { prisma } from "@/lib/prisma";

export const AI_BOT_EMAIL = "ai-bot@metrum.group";
export const AI_BOT_NAME = "AI асистент";

let cachedBotUserId: string | null = null;

/**
 * Lazily get or create the AI system user that authors in-chat AI replies.
 * The account is inactive and uses an unusable password hash, so it cannot
 * sign in. STAFF role so conversation participant guards keep working.
 */
export async function getOrCreateAiBotUser(): Promise<{ id: string }> {
  if (cachedBotUserId) return { id: cachedBotUserId };

  const existing = await prisma.user.findUnique({
    where: { email: AI_BOT_EMAIL },
    select: { id: true },
  });
  if (existing) {
    cachedBotUserId = existing.id;
    return { id: existing.id };
  }

  const created = await prisma.user.create({
    data: {
      email: AI_BOT_EMAIL,
      name: AI_BOT_NAME,
      password: "$ai-bot-no-login$",
      role: "SUPER_ADMIN",
      isActive: false,
    },
    select: { id: true },
  });
  cachedBotUserId = created.id;
  return { id: created.id };
}

/**
 * Detect an `@ai <prompt>` mention at the start or as a standalone segment
 * of a message body. Returns the prompt text after the tag, or null if not
 * present.
 */
export function parseAiMentionPrompt(body: string): string | null {
  if (!body) return null;
  const match = body.match(/(?:^|\s)@ai\b[ \t]*([\s\S]*)$/i);
  if (!match) return null;
  const prompt = match[1].trim();
  return prompt.length > 0 ? prompt : null;
}
