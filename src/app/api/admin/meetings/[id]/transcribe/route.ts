import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { downloadFileFromR2 } from "@/lib/r2-client";

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY не налаштований" },
      { status: 500 }
    );
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!meeting.audioR2Key) {
    return NextResponse.json(
      { error: "Аудіо ще не завантажено" },
      { status: 400 }
    );
  }

  await prisma.meeting.update({
    where: { id },
    data: { status: "TRANSCRIBING", processingError: null },
  });

  try {
    const audioBuffer = await downloadFileFromR2(meeting.audioR2Key);
    const extension = extractExtension(meeting.audioR2Key, meeting.audioMimeType);
    const file = await OpenAI.toFile(audioBuffer, `meeting-${id}${extension}`, {
      type: meeting.audioMimeType || "audio/webm",
    });

    // Whisper prompt — лише спелінг-підказки для імен (multilingual neutral).
    // ВАЖЛИВО: не задаємо `language` — Whisper сам визначає мову на сегмент.
    // Раніше було `language: "uk"` + UA-only словник, через що модель силкувалась
    // мапити російське мовлення на українські слова і ламала імена
    // («Любовь Николаевна» → «Кривом Ніколаєв»). RAW-транскрипт має зберігати
    // оригінальну мову мовлення; переклад (за потреби) — на рівні summary.
    const namePool = await collectNameHints();
    const whisperPrompt = buildWhisperHint({
      meetingTitle: meeting.title,
      meetingDescription: meeting.description,
      names: namePool,
    });

    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      prompt: whisperPrompt,
      temperature: 0,
    });

    const transcript = result.text || "";
    const durationSec = (result as unknown as { duration?: number }).duration;

    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        transcript,
        status: "TRANSCRIBED",
        audioDurationMs:
          durationSec && !meeting.audioDurationMs
            ? Math.round(durationSec * 1000)
            : meeting.audioDurationMs ?? null,
      },
    });

    return NextResponse.json({ meeting: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("Whisper error:", err);
    await prisma.meeting.update({
      where: { id },
      data: { status: "FAILED", processingError: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function collectNameHints(): Promise<string[]> {
  // Імена і ПІБ активних користувачів — щоб Whisper розпізнавав їх правильно.
  // 60 свіжих не-CLIENT — більше не вліземо в ліміт промпта.
  const users = await prisma.user.findMany({
    where: { role: { not: "CLIENT" } },
    select: { name: true },
    take: 60,
    orderBy: { updatedAt: "desc" },
  });
  return users.map((u) => u.name).filter((n): n is string => !!n && n.trim().length > 0);
}

function buildWhisperHint(opts: {
  meetingTitle: string;
  meetingDescription?: string | null;
  names: string[];
}): string {
  // Промпт — мовно-нейтральний. Whisper використовує його як спелінг-приклад,
  // тож будь-яка односторонньо-українська преамбула біасить транскрипт у бік UA
  // і ламає російські імена/слова. Лишаємо мінімум: назву наради (як її задав
  // користувач) і список імен учасників у їх оригінальному написанні.
  const parts: string[] = [
    opts.meetingTitle ? opts.meetingTitle + "." : "",
    opts.meetingDescription ? opts.meetingDescription + "." : "",
    opts.names.length > 0 ? opts.names.join(", ") + "." : "",
  ].filter(Boolean);
  // Whisper обмежує prompt на ~244 токени. ~4 символи на токен → 900 симв.
  const joined = parts.join(" ");
  return joined.length > 900 ? joined.slice(0, 900) : joined;
}

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
    if (mime.includes("flac")) return ".flac";
    if (mime.includes("opus")) return ".opus";
    if (mime.includes("aac")) return ".aac";
    if (mime.includes("amr")) return ".amr";
    if (mime.includes("3gp")) return ".3gp";
  }
  return ".webm";
}
