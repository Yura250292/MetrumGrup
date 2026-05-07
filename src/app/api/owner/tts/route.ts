import { NextRequest } from "next/server";
import { z } from "zod";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  text: z.string().min(1).max(4096),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional().default("nova"),
});

/**
 * POST /api/owner/tts — генерує MP3 аудіо з тексту через OpenAI TTS API.
 * Голос якісно "людський" (gpt-4o-mini-tts → але tts-1-hd кращий для української).
 *
 * Vibrant voices для української мови:
 *  - nova: жіночий, виразний (default)
 *  - shimmer: жіночий, м'який
 *  - alloy: нейтральний
 *  - onyx: чоловічий, серйозний
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
        model: "tts-1-hd",
        input: parsed.data.text,
        voice: parsed.data.voice,
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
