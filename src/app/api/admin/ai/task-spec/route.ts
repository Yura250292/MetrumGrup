import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  TASK_SPEC_SYSTEM_PROMPT,
  buildTaskSpecUserPrompt,
} from "@/lib/ai-assistant/task-spec-prompt";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

const BodySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(4000).optional(),
  projectId: z.string().optional(),
});

const SpecSchema = z.object({
  goal: z.string(),
  scope: z.string(),
  deliverables: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  suggestedDueDate: z.string().nullable().optional(),
  suggestedPriority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  suggestedEstimatedHours: z.number().nullable().optional(),
  checklist: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  involvedRoles: z.array(z.string()).default([]),
  clarifications: z.array(z.string()).default([]),
  markdown: z.string(),
});

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(userId);
  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI не налаштований (OPENAI_API_KEY відсутній)" },
      { status: 500 },
    );
  }
  if (!checkRateLimit(session.user.id)) {
    return NextResponse.json(
      { error: "Перевищено ліміт AI-запитів (20/год). Спробуйте пізніше." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некоректні параметри запиту" },
      { status: 400 },
    );
  }
  const { title, description, projectId } = parsed.data;

  let projectTitle: string | undefined;
  let projectStage: string | undefined;
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { title: true, currentStage: true },
    });
    projectTitle = project?.title;
    projectStage = project?.currentStage;
  }

  const userPrompt = buildTaskSpecUserPrompt({
    title,
    description,
    projectTitle,
    projectStage,
    assignerName: session.user.name ?? undefined,
    today: new Date().toISOString().slice(0, 10),
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TASK_SPEC_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let specParsed: z.infer<typeof SpecSchema> | null = null;
    try {
      const jsonCandidate = JSON.parse(raw);
      const validation = SpecSchema.safeParse(jsonCandidate);
      if (validation.success) specParsed = validation.data;
    } catch {
      /* fall through to fallback */
    }

    if (!specParsed) {
      return NextResponse.json({
        spec: null,
        markdown:
          raw ||
          `## Мета\n${title}\n\n${description ?? ""}\n\n> AI повернув невалідний JSON. Відредагуйте ТЗ вручну.`,
      });
    }

    return NextResponse.json({
      spec: specParsed,
      markdown: specParsed.markdown,
    });
  } catch (err) {
    console.error("[ai/task-spec]", err);
    return NextResponse.json(
      { error: "Не вдалося згенерувати ТЗ. Спробуйте ще раз." },
      { status: 500 },
    );
  }
}
