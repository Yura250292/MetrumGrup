import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

type ComposeMode = "grammar" | "formal" | "friendly" | "emoji" | "shorter" | "longer";

const MODE_PROMPTS: Record<ComposeMode, string> = {
  grammar:
    "Виправ граматику, орфографію та пунктуацію. Збережи авторський стиль і тон. НЕ перефразовуй, НЕ додавай нічого нового.",
  formal:
    "Переформулюй текст в офіційному, діловому тоні — як для колег чи клієнтів. Прибери сленг. Збережи суть і обсяг.",
  friendly:
    "Переформулюй текст у дружньому, теплому тоні. Зроби його живішим, без надмірної офіційності. Збережи суть.",
  emoji:
    "Додай 2–4 доречних емодзі до тексту (на початок, середину або кінець відповідно до контексту). Не переписуй текст, лише встав емодзі.",
  shorter:
    "Скороти текст до найсуттєвішого. Прибери воду та повтори. Збережи ключові факти та прохання.",
  longer:
    "Розшир текст: додай структури, уточнень, контексту. Зроби його повнішим і зрозумілішим для колеги, який не знає передісторії.",
};

function isValidMode(value: unknown): value is ComposeMode {
  return typeof value === "string" && value in MODE_PROMPTS;
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffAccess();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не налаштований" },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const mode = body.mode;

    if (!text) {
      return NextResponse.json({ error: "Текст обов'язковий" }, { status: 400 });
    }
    if (text.length > 4000) {
      return NextResponse.json({ error: "Текст занадто довгий (макс 4000)" }, { status: 400 });
    }
    if (!isValidMode(mode)) {
      return NextResponse.json({ error: "Невідомий режим" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: mode === "grammar" ? 0.1 : 0.5,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content:
            `Ти помічник для редагування повідомлень у корпоративному чаті. Відповідай українською мовою (якщо текст україномовний), інакше — мовою оригіналу. ${MODE_PROMPTS[mode]} Поверни ТІЛЬКИ перероблений текст без передмов, коментарів чи лапок.`,
        },
        { role: "user", content: text },
      ],
    });

    const output = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!output) {
      return NextResponse.json({ error: "Порожня відповідь від моделі" }, { status: 502 });
    }

    return NextResponse.json({ text: output, mode });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    console.error("[chat/ai/compose] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
