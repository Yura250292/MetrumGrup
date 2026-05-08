import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { AssemblyAI } from "assemblyai";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { downloadFileFromR2 } from "@/lib/r2-client";

// Vercel Pro дає максимум 300с на serverless. AssemblyAI Universal на коротких
// нарадах (< 5хв) укладається у ~30-60с; на довгих може поломитись по timeout —
// у цьому випадку треба буде перейти на webhook-pattern (submit+callback).
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

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({ where: { id } });
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

  // Synergy AssemblyAI Universal + GPT-4o:
  //  - якщо ASSEMBLYAI_API_KEY заданий → universal модель з діаризацією,
  //    language detection (UA/RU автоматично), entities, chapters
  //  - інакше fallback на Whisper-1 (мовно-нейтральний промпт)
  const useAssemblyAI = !!process.env.ASSEMBLYAI_API_KEY;

  try {
    if (useAssemblyAI) {
      const updated = await transcribeWithAssemblyAI(meeting);
      return NextResponse.json({ meeting: updated });
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "Не налаштовано ні ASSEMBLYAI_API_KEY, ні OPENAI_API_KEY"
      );
    }
    const updated = await transcribeWithWhisper(meeting);
    return NextResponse.json({ meeting: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    const stack = err instanceof Error ? err.stack : undefined;
    // Ставимо багато шуму в логи щоб у Vercel Functions можна було бачити
    // ЯКА саме гілка зламалась (AssemblyAI vs Whisper, на якому етапі).
    console.error("[transcribe] meeting", meeting.id, "failed:", {
      provider: useAssemblyAI ? "assemblyai" : "whisper",
      hasAudioUrl: !!meeting.audioUrl,
      hasAudioR2Key: !!meeting.audioR2Key,
      audioMimeType: meeting.audioMimeType,
      audioSizeBytes: meeting.audioSizeBytes,
      message,
      stack,
    });
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: "FAILED", processingError: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────
// AssemblyAI Universal
// ────────────────────────────────────────────────────────────────────────

type MeetingRow = Awaited<ReturnType<typeof prisma.meeting.findUnique>>;

async function transcribeWithAssemblyAI(meeting: NonNullable<MeetingRow>) {
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });

  // Завантажуємо аудіо локально через R2 SDK (auth) і передаємо Buffer
  // напряму в AssemblyAI. Це уникає залежності від того, чи публічний R2-bucket
  // (audioUrl може бути signed або вимагати CORS, що часто ламає AssemblyAI fetch).
  if (!meeting.audioR2Key) {
    throw new Error("Немає audioR2Key — не можу завантажити аудіо з R2");
  }
  const audioInput: Buffer = await downloadFileFromR2(meeting.audioR2Key);

  // Імена з User бази — додатково підкажуть Universal-моделі правильне написання.
  const namePool = await collectNameHints();
  const wordBoost = namePool.slice(0, 50); // ліміт ~1000 boost-токенів сумарно

  const transcript = await client.transcripts.transcribe({
    audio: audioInput,
    speech_model: "universal",
    speaker_labels: true,
    language_detection: true,
    entity_detection: true,
    auto_chapters: true,
    auto_highlights: true,
    // wordBoost зберігає правильне написання імен (Любовь Николаевна не
    // ламається у «Кривом Ніколаєв»). До 1000 елементів сумарно.
    word_boost: wordBoost.length > 0 ? wordBoost : undefined,
    boost_param: "high",
  });

  if (transcript.status === "error") {
    throw new Error(transcript.error || "AssemblyAI повернув помилку");
  }

  // Збираємо людино-читаний транскрипт із діаризацією:
  //   Speaker A [00:01:23]: ...
  //   Speaker B [00:01:35]: ...
  const utterances = transcript.utterances ?? [];
  const speakerSet = new Set<string>();
  const formattedLines: string[] = [];
  for (const u of utterances) {
    if (u.speaker) speakerSet.add(u.speaker);
    const ts = formatMs(u.start ?? 0);
    formattedLines.push(`Speaker ${u.speaker ?? "?"} [${ts}]: ${u.text}`);
  }
  const formattedTranscript =
    formattedLines.length > 0
      ? formattedLines.join("\n\n")
      : transcript.text || "";

  const updated = await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      transcript: formattedTranscript,
      status: "TRANSCRIBED",
      transcribeProvider: "assemblyai",
      speakerCount: speakerSet.size > 0 ? speakerSet.size : null,
      // Зберігаємо сирі сигнали для GPT-4o post-processing (summarize step).
      utterances: utterances as unknown as object,
      entities: (transcript.entities ?? []) as unknown as object,
      chapters: (transcript.chapters ?? []) as unknown as object,
      audioDurationMs:
        typeof transcript.audio_duration === "number" &&
        !meeting.audioDurationMs
          ? Math.round(transcript.audio_duration * 1000)
          : meeting.audioDurationMs ?? null,
    },
  });

  return updated;
}

// ────────────────────────────────────────────────────────────────────────
// Whisper fallback
// ────────────────────────────────────────────────────────────────────────

async function transcribeWithWhisper(meeting: NonNullable<MeetingRow>) {
  if (!meeting.audioR2Key) {
    throw new Error("Whisper fallback потребує audioR2Key");
  }
  const audioBuffer = await downloadFileFromR2(meeting.audioR2Key);
  const extension = extractExtension(
    meeting.audioR2Key,
    meeting.audioMimeType
  );
  const file = await OpenAI.toFile(
    audioBuffer,
    `meeting-${meeting.id}${extension}`,
    { type: meeting.audioMimeType || "audio/webm" }
  );

  // Whisper: мовно-нейтральний промпт, без `language` хінта.
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
    where: { id: meeting.id },
    data: {
      transcript,
      status: "TRANSCRIBED",
      transcribeProvider: "whisper",
      audioDurationMs:
        durationSec && !meeting.audioDurationMs
          ? Math.round(durationSec * 1000)
          : meeting.audioDurationMs ?? null,
    },
  });

  return updated;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

async function collectNameHints(): Promise<string[]> {
  // Імена і ПІБ активних співробітників — підказка моделі правильне написання.
  // 60 свіжих не-CLIENT — компроміс між охопленням і ліматами prompt/word_boost.
  const users = await prisma.user.findMany({
    where: { role: { not: "CLIENT" } },
    select: { name: true },
    take: 60,
    orderBy: { updatedAt: "desc" },
  });
  return users
    .map((u) => u.name)
    .filter((n): n is string => !!n && n.trim().length > 0);
}

function buildWhisperHint(opts: {
  meetingTitle: string;
  meetingDescription?: string | null;
  names: string[];
}): string {
  const parts: string[] = [
    opts.meetingTitle ? opts.meetingTitle + "." : "",
    opts.meetingDescription ? opts.meetingDescription + "." : "",
    opts.names.length > 0 ? opts.names.join(", ") + "." : "",
  ].filter(Boolean);
  const joined = parts.join(" ");
  return joined.length > 900 ? joined.slice(0, 900) : joined;
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
