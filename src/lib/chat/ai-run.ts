import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getOrCreateAiBotUser } from "@/lib/chat/ai-bot";
import {
  buildConversationAiContext,
  type AiContextResult,
} from "@/lib/chat/ai-context";

export type AiModelChoice = "gpt-4o" | "gpt-4o-mini" | "gemini-2.5-flash";

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

async function callOpenAi(
  model: "gpt-4o" | "gpt-4o-mini",
  prompt: string,
  ctx: AiContextResult,
): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

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
    model,
    temperature: 0.35,
    max_tokens: 900,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

async function callGemini(prompt: string, ctx: AiContextResult): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY не налаштований");
  }

  const contextBlock = ctx.notes.length
    ? `${ctx.transcript}\n\n[Службові примітки щодо контексту:\n${ctx.notes.join("\n")}]`
    : ctx.transcript;

  const parts: Array<
    | { text: string }
    | { inlineData: { data: string; mimeType: string } }
  > = [
    {
      text: `${SYSTEM_PROMPT}\n\n--- Контекст останніх повідомлень та файлів у чаті: ---\n${contextBlock}\n\n--- Запит користувача: ---\n${prompt}`,
    },
  ];

  // Fetch images inline for Gemini (no direct URL support like OpenAI image_url).
  for (const img of ctx.images) {
    try {
      const res = await fetch(img.url);
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      const base64 = Buffer.from(ab).toString("base64");
      parts.push({
        inlineData: { data: base64, mimeType: img.mimeType || "image/jpeg" },
      });
    } catch (err) {
      console.warn("[ai-run/gemini] image fetch failed:", err);
    }
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 900,
    },
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });

  return result.response.text().trim();
}

/**
 * Generate an AI reply and persist it as a ChatMessage authored by the AI
 * bot. Safe to call multiple times per conversation. Returns the created
 * message row (or null if the model produced nothing).
 */
export async function runAiReply(opts: {
  conversationId: string;
  prompt: string;
  model?: AiModelChoice;
}): Promise<{ id: string; body: string } | null> {
  const choice: AiModelChoice = opts.model ?? "gpt-4o";
  const bot = await getOrCreateAiBotUser();
  const ctx = await buildConversationAiContext(opts.conversationId, bot.id, {
    messageLimit: 20,
  });

  let reply: string;
  if (choice === "gemini-2.5-flash") {
    reply = await callGemini(opts.prompt, ctx);
  } else {
    reply = await callOpenAi(choice, opts.prompt, ctx);
  }

  reply = (reply ?? "").trim();
  if (!reply) return null;

  const [created] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId: opts.conversationId,
        authorId: bot.id,
        body: reply,
      },
      select: { id: true, body: true },
    }),
    prisma.conversation.update({
      where: { id: opts.conversationId },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  return created;
}
