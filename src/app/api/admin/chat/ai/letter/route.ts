import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
  requireStaffAccess,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

const VALID_TONES = ["formal", "friendly", "concise"] as const;
type Tone = (typeof VALID_TONES)[number];

const VALID_LANGUAGES = ["uk", "en"] as const;
type Language = (typeof VALID_LANGUAGES)[number];

const TONE_HINTS: Record<Tone, string> = {
  formal: "офіційний, діловий тон; чіткі формулювання; ввічливо",
  friendly: "дружній, теплий тон; простими словами; без надмірної офіційності",
  concise: "стислий тон; без води; тільки ключові факти і запит/пропозиція",
};

const LANGUAGE_HINTS: Record<Language, string> = {
  uk: "Напиши лист українською мовою.",
  en: "Write the letter in English.",
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffAccess();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не налаштований" },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const messageIds = Array.isArray(body.messageIds)
      ? (body.messageIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const tone: Tone = VALID_TONES.includes(body.tone) ? body.tone : "formal";
    const language: Language = VALID_LANGUAGES.includes(body.language)
      ? body.language
      : "uk";
    const extraInstruction =
      typeof body.instruction === "string" ? body.instruction.slice(0, 500) : "";

    if (!conversationId || messageIds.length === 0) {
      return NextResponse.json(
        { error: "conversationId та messageIds обов'язкові" },
        { status: 400 },
      );
    }
    if (messageIds.length > 50) {
      return NextResponse.json(
        { error: "Максимум 50 повідомлень" },
        { status: 400 },
      );
    }

    // Auth: caller must be participant of the conversation, and the messages
    // must belong to it.
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: session.user.id,
        },
      },
      select: { conversationId: true },
    });
    if (!participant) return forbiddenResponse();

    const messages = await prisma.chatMessage.findMany({
      where: {
        id: { in: messageIds },
        conversationId,
        deletedAt: null,
      },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Повідомлень не знайдено" },
        { status: 404 },
      );
    }

    const transcript = messages
      .map((m) => {
        const name = m.author?.name ?? "Невідомий";
        const body = m.body?.trim();
        return body ? `${name}: ${body}` : `${name}: [вкладення]`;
      })
      .join("\n");

    const systemPrompt =
      `Ти помічник з ділового листування у будівельній компанії Metrum Group. Напиши лист у форматі markdown на основі наданих повідомлень чату. Тон: ${TONE_HINTS[tone]}. ${LANGUAGE_HINTS[language]} Структура: тема в першому рядку (# Тема: …), вітання, тіло з 1–3 абзаців, підпис-плейсхолдер. Не вигадуй імена, контакти, дати чи факти, яких немає у вхідних повідомленнях — залишай такі місця у вигляді [плейсхолдер]. Поверни ТІЛЬКИ лист (markdown), без передмов.`;

    const userPrompt = extraInstruction
      ? `Матеріал з чату:\n${transcript}\n\nДодаткові побажання: ${extraInstruction}`
      : `Матеріал з чату:\n${transcript}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const letter = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!letter) {
      return NextResponse.json(
        { error: "Порожня відповідь від моделі" },
        { status: 502 },
      );
    }

    return NextResponse.json({ letter, tone, language });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/ai/letter] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
