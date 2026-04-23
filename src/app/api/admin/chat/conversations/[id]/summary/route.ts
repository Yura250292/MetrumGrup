import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

const MAX_MESSAGES = 200;

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id: conversationId } = await ctx.params;

    // Verify current user is a participant of the conversation.
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: session.user.id } },
      select: { conversationId: true },
    });
    if (!participant) return forbiddenResponse();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не налаштований" },
        { status: 500 },
      );
    }

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: MAX_MESSAGES,
      include: {
        author: { select: { name: true } },
        attachments: { select: { mimeType: true, name: true } },
      },
    });

    if (messages.length === 0) {
      return NextResponse.json({
        summary: "У розмові ще немає повідомлень для підсумку.",
        messageCount: 0,
      });
    }

    // Flatten messages to a compact transcript for the model.
    const transcript = messages
      .map((m) => {
        const author = m.author?.name ?? "Невідомий";
        const time = m.createdAt.toISOString().slice(0, 16).replace("T", " ");
        let body = m.body?.trim() ?? "";
        if (!body && m.attachments.length > 0) {
          const kinds = m.attachments.map((a) => {
            if (a.mimeType.startsWith("audio/")) return "🎙 голосове";
            if (a.mimeType.startsWith("image/")) return "🖼 зображення";
            if (a.mimeType.startsWith("video/")) return "🎬 відео";
            return `📎 ${a.name}`;
          });
          body = `[${kinds.join(", ")}]`;
        }
        return `[${time}] ${author}: ${body}`;
      })
      .join("\n");

    const systemPrompt =
      "Ти помічник для структурування командних чатів. Проаналізуй розмову і дай стислий підсумок українською мовою у форматі Markdown. Розділи: \"Ключові рішення\", \"Відкриті питання\", \"Наступні кроки з виконавцями\" (якщо їх видно), \"Ризики\" (якщо є). Уникай переказу повідомлень по одному — синтезуй зміст. Якщо якогось розділу немає у розмові — пропусти його.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
    });

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!summary) {
      return NextResponse.json({ error: "Порожня відповідь від моделі" }, { status: 502 });
    }

    return NextResponse.json({
      summary,
      messageCount: messages.length,
      truncated: messages.length >= MAX_MESSAGES,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/summary] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
