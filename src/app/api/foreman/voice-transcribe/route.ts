import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper limit

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

function extFromMime(mime: string | null): string {
  if (!mime) return ".webm";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return ".m4a";
  if (mime.includes("mpeg") || mime.includes("mpga")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("ogg") || mime.includes("oga")) return ".ogg";
  return ".webm";
}

/**
 * Foreman voice-to-text. Accepts multipart/form-data with `audio` field. Returns
 * raw transcript that УI потім підставляє у textarea і викликає /reports/parse.
 *
 * Rationale: тримаємо transcribe окремо від parse, щоб foreman міг переглянути
 * розпізнаний текст перед AI-парсингом (виправити прізвища, ціни, тощо).
 */
export async function POST(req: NextRequest) {
  try {
    await requireForeman();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY не налаштований" },
      { status: 500 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Bad request", message: "Аудіо не надіслано" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: "Bad request", message: "Аудіо порожнє" },
      { status: 400 },
    );
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Too large", message: "Запис перевищує 25 МБ — скоротіть тривалість" },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = extFromMime(file.type);
  const mime = file.type || "audio/webm";
  const upload = await OpenAI.toFile(buf, `foreman-voice${ext}`, { type: mime });

  try {
    const result = await openai.audio.transcriptions.create({
      file: upload,
      model: "whisper-1",
      language: "uk",
      response_format: "json",
    });
    const transcript = (result.text ?? "").trim();
    return NextResponse.json({ transcript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Помилка розпізнавання";
    console.error("[foreman/voice-transcribe] failed:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
