import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
  requireAdminRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";

export const maxDuration = 120;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `Ти — асистент, який аналізує транскрипти ділових нарад українською мовою.
Твоя задача — виділити з розмови ключову інформацію і повернути її у структурованому JSON форматі.
Якщо в транскрипті є імена, зберігай їх як у оригіналі. Якщо дедлайн не вказано — поверни null.
Пиши стисло і конкретно. Усі текстові поля — українською.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description: "Короткий підсумок наради в 3-5 реченнях",
    },
    keyPoints: {
      type: "array",
      items: { type: "string" },
      description: "Ключові моменти обговорення",
    },
    decisions: {
      type: "array",
      items: { type: "string" },
      description: "Прийняті рішення",
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          assignee: { type: ["string", "null"] },
          dueDate: { type: ["string", "null"] },
        },
        required: ["title", "assignee", "dueDate"],
      },
      description: "Задачі з відповідальними і дедлайнами",
    },
    nextSteps: {
      type: "array",
      items: { type: "string" },
      description: "Наступні кроки",
    },
    openQuestions: {
      type: "array",
      items: { type: "string" },
      description: "Невирішені питання",
    },
  },
  required: [
    "summary",
    "keyPoints",
    "decisions",
    "tasks",
    "nextSteps",
    "openQuestions",
  ],
} as const;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminRole();
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
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!meeting.transcript?.trim()) {
    return NextResponse.json(
      { error: "Транскрипт ще не готовий" },
      { status: 400 }
    );
  }

  await prisma.meeting.update({
    where: { id },
    data: { status: "SUMMARIZING", processingError: null },
  });

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Назва наради: ${meeting.title}\n\nТранскрипт:\n${meeting.transcript}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "meeting_summary",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const structured = JSON.parse(raw);
    const tokensUsed = response.usage?.total_tokens ?? null;

    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        status: "READY",
        summary: structured.summary ?? null,
        structured,
        aiModelUsed: MODEL,
        aiTokensUsed: tokensUsed,
      },
    });

    return NextResponse.json({ meeting: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summarization failed";
    console.error("Summarize error:", err);
    await prisma.meeting.update({
      where: { id },
      data: { status: "FAILED", processingError: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
