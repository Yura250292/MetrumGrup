import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
  requireStaffAccess,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { downloadFileFromR2 } from "@/lib/r2-client";

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper API limit

function extractExtension(key: string, mime?: string | null): string {
  const dot = key.lastIndexOf(".");
  if (dot >= 0) {
    const ext = key.slice(dot).toLowerCase();
    if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
  }
  if (mime) {
    if (mime.includes("webm")) return ".webm";
    if (mime.includes("mp4") || mime.includes("m4a")) return ".m4a";
    if (mime.includes("mpeg") || mime.includes("mpga")) return ".mp3";
    if (mime.includes("wav")) return ".wav";
    if (mime.includes("ogg") || mime.includes("oga")) return ".ogg";
  }
  return ".webm";
}

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { attachmentId } = await ctx.params;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не налаштований" },
        { status: 500 },
      );
    }

    const attachment = await prisma.chatMessageAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: {
            conversationId: true,
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Вкладення не знайдено" }, { status: 404 });
    }
    if (!attachment.mimeType.startsWith("audio/")) {
      return NextResponse.json(
        { error: "Транскрибувати можна лише аудіо" },
        { status: 400 },
      );
    }
    if (!attachment.r2Key) {
      return NextResponse.json(
        { error: "Аудіо недоступне для обробки" },
        { status: 400 },
      );
    }
    if (attachment.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Аудіо перевищує 25 МБ" },
        { status: 400 },
      );
    }

    // Participant guard: only members of the conversation may transcribe.
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: attachment.message.conversationId,
          userId: session.user.id,
        },
      },
      select: { conversationId: true },
    });
    if (!participant) return forbiddenResponse();

    if (attachment.transcript && attachment.transcript.trim().length > 0) {
      return NextResponse.json({
        transcript: attachment.transcript,
        cached: true,
      });
    }

    const audioBuffer = await downloadFileFromR2(attachment.r2Key);
    const ext = extractExtension(attachment.r2Key, attachment.mimeType);
    const file = await OpenAI.toFile(audioBuffer, `chat-${attachmentId}${ext}`, {
      type: attachment.mimeType || "audio/webm",
    });

    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "uk",
      response_format: "json",
    });

    let transcript = (result.text ?? "").trim();

    // If the clip is longer than 30 s, add a short structured breakdown below
    // the raw transcript via gpt-4o. The raw transcript is kept as the first
    // block so the user always has the verbatim text too.
    const longEnough =
      (attachment.durationMs ?? 0) >= 30_000 && transcript.length > 200;
    if (longEnough) {
      try {
        const structured = await openai.chat.completions.create({
          model: "gpt-4o",
          temperature: 0.2,
          max_tokens: 600,
          messages: [
            {
              role: "system",
              content:
                "Ти структуруєш голосову нотатку у стислу markdown-замітку українською: короткі буллети, пріоритети, згадані задачі, відкриті питання. Поверни ТІЛЬКИ markdown без передмов.",
            },
            { role: "user", content: transcript },
          ],
        });
        const structuredText =
          structured.choices[0]?.message?.content?.trim() ?? "";
        if (structuredText) {
          transcript = `${transcript}\n\n---\n\n**Структура:**\n\n${structuredText}`;
        }
      } catch (e) {
        console.warn("[chat/transcribe] structuring failed:", e);
      }
    }

    await prisma.chatMessageAttachment.update({
      where: { id: attachmentId },
      data: { transcript },
    });

    return NextResponse.json({ transcript, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/attachments/transcribe] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
