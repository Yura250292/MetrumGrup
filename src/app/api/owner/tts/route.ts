import { NextRequest } from "next/server";
import { z } from "zod";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VOICE_VALUES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
] as const;

const Body = z.object({
  text: z.string().min(1).max(4096),
  voice: z.enum(VOICE_VALUES).optional().default("sage"),
});

/**
 * POST /api/owner/tts — генерує MP3 з тексту через OpenAI gpt-4o-mini-tts.
 * Найновіша модель з voice 'instructions' — звучить значно природніше
 * за tts-1/tts-1-hd і коректно вимовляє українську.
 *
 * Voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer.
 * За замовчуванням 'sage' — теплий жіночий нейтральний акцент,
 * добре звучить для бізнес-аналітики.
 */
export async function POST(req: NextRequest) {
  try {
    await requireOwner();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY not configured", { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return new Response("Bad request", { status: 400 });

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: parsed.data.text,
        voice: parsed.data.voice,
        instructions:
          "Speak in fluent natural Ukrainian language with warm calm professional tone — like a financial analyst presenting to a director. Use natural intonation pauses for tables and numbers. Do not sound robotic.",
        response_format: "mp3",
        speed: 1.0,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[owner/tts] OpenAI error:", errText);
      return new Response(`TTS failed: ${res.status}`, { status: 502 });
    }

    // Stream MP3 back до клієнта
    return new Response(res.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("[owner/tts] error:", e);
    return new Response("Server error", { status: 500 });
  }
}
