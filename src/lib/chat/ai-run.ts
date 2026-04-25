import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getOrCreateAiBotUser } from "@/lib/chat/ai-bot";
import {
  buildConversationAiContext,
  type AiContextResult,
} from "@/lib/chat/ai-context";

export type AiModelChoice =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gemini-2.5-flash"
  | "claude-opus-4-7"
  | "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Ти AI-асистент у корпоративному чаті Metrum Group (будівельна компанія).
Відповідай українською, чітко й структуровано. Використовуй наданий контекст:
- Recent chat messages (із позначками автора).
- Витягнутий текст файлів з чату (PDF / TXT / DOC): позначений "=== ФАЙЛ: … ===" / "=== PDF: … ===" / "=== ДОКУМЕНТ: … ===".
- Транскрипти аудіо: позначені "=== АУДІО-ТРАНСКРИПТ: … ===".
- Зображення — доступні тобі як vision input поряд з цим текстом.

ФОРМАТУВАННЯ ВІДПОВІДІ (важливо):
- Завжди markdown. Розділюй смислові блоки порожнім рядком.
- Заголовки: # для головної теми, ## для секцій, ### для підрозділів. Перед заголовком завжди порожній рядок.
- **Жирний** для термінів, сум, дат, контрагентів, штрафів. \`code\` для номерів пунктів (\`п. 2.1.3\`), статей (\`ст. 220 ЦКУ\`), формул.
- > Цитуй рядок або фразу з документу перед своїм коментарем — щоб було видно першоджерело.
- Списки тільки коли їх ≥2 елементи. Один пункт — звичайний рядок.
- Розділювач \`---\` тільки між великими секціями (категоріями ризиків, етапами плану), не між кожним пунктом.

ЕМОДЗІ-МАРКЕРИ (використовуй послідовно, не ради краси):
- Категорії ризику: 🟡 важливо · 🟠 дуже важливо · 🔴 критично
- Дії: ✅ зробити · ⚠️ перевірити · 🚨 терміново
- Сутності: 📌 ключовий пункт · 💡 порада · 📅 дата · 💰 сума · 📎 документ · 🔍 уточнити
- Підсумки: 📊 цифри · ✍️ підпис · 🤝 узгодити з контрагентом

ПОБУДОВА ВІДПОВІДІ ДЛЯ АНАЛІЗУ ДОКУМЕНТА (договір, ТЗ, лист):
1. Короткий висновок 1–2 реченнями (хто, що, головний ризик).
2. Розбивка по категоріях ризику (🔴 → 🟠 → 🟡), у кожному пункті:
   ### Емодзі **п. X.Y** — назва пункту
   > коротка цитата з документу
   **Чому категорія:** одне речення.
   **Що робити:** маркований список (2–4 пункти, дієслова в інфінітиві).
3. У кінці — секція **План дій** з 3–7 кроків у порядку пріоритету (терміново / цей тиждень / до підписання).

ОБМЕЖЕННЯ:
- НЕ вигадуй факти, цифри, імена, дати, яких немає у вхідному тексті/документах.
- Якщо чогось не видно у наданому контексті — скажи прямо ("у наданому фрагменті цього не видно").
- Не повторюй пункти, які НЕ містять важливої інформації — пропускай їх беззвучно.
- Якщо документ великий і ти бачиш, що не вмістиш всі пункти — обери найважливіші і явно попередь у кінці: "Аналіз обмежено через об'єм; продовжити?"`;

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
    max_tokens: 4000,
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
      maxOutputTokens: 4000,
    },
    tools: [{ googleSearchRetrieval: {} }],
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });

  const text = result.response.text().trim();

  // Append sources when grounding kicked in.
  const grounding = result.response.candidates?.[0]?.groundingMetadata;
  const chunks = grounding?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => c.web)
    .filter((w): w is { uri?: string; title?: string } => Boolean(w?.uri))
    .slice(0, 5);

  if (sources.length > 0) {
    const lines = sources.map((s, i) => {
      const title = s.title ?? s.uri ?? `Джерело ${i + 1}`;
      return `${i + 1}. [${title}](${s.uri})`;
    });
    return `${text}\n\n---\n🌐 **Джерела (Google Search):**\n${lines.join("\n")}`;
  }

  return text;
}

const CLAUDE_MODEL_ID: Record<"claude-opus-4-7" | "claude-sonnet-4-6", string> = {
  "claude-opus-4-7": "claude-opus-4-7",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
};

const MODEL_LABELS: Record<AiModelChoice, string> = {
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
};

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return { data: Buffer.from(ab).toString("base64"), mediaType: contentType };
  } catch {
    return null;
  }
}

async function callClaude(
  model: "claude-opus-4-7" | "claude-sonnet-4-6",
  prompt: string,
  ctx: AiContextResult,
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY не налаштований на сервері. Додайте ключ у Vercel Env Variables.",
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const contextBlock = ctx.notes.length
    ? `${ctx.transcript}\n\n[Службові примітки щодо контексту:\n${ctx.notes.join("\n")}]`
    : ctx.transcript;

  const userContent: Anthropic.Messages.ContentBlockParam[] = [];

  for (const img of ctx.images) {
    const fetched = await fetchImageAsBase64(img.url);
    if (!fetched) continue;
    // Claude validates media types; fall back to jpeg if header is generic.
    const mediaType = (
      ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(fetched.mediaType)
        ? fetched.mediaType
        : "image/jpeg"
    ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: fetched.data },
    });
  }

  userContent.push({
    type: "text",
    text: `Контекст останніх повідомлень та файлів у чаті:\n\n${contextBlock}\n\n---\nПоточний запит до тебе: ${prompt}`,
  });

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL_ID[model],
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const textBlocks = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text);
  return textBlocks.join("\n").trim();
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
  } else if (choice === "claude-opus-4-7" || choice === "claude-sonnet-4-6") {
    reply = await callClaude(choice, opts.prompt, ctx);
  } else {
    reply = await callOpenAi(choice, opts.prompt, ctx);
  }

  reply = (reply ?? "").trim();
  if (!reply) return null;

  // Mark which model produced the reply so the thread is auditable.
  reply = `${reply}\n\n— _🤖 ${MODEL_LABELS[choice]}_`;

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
