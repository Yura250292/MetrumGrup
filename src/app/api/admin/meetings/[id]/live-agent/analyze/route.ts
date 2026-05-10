import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { analyzeChunk, dedupeInsight } from "@/lib/meetings/live-agent";

export const maxDuration = 60;

// Throttling: не приймаємо нові виклики для одного meeting частіше ніж раз
// на N мс (на стороні сервера, як другий рубіж — клієнт теж дроселить).
const MIN_INTERVAL_MS = 15_000;
const MIN_CHUNK_CHARS = 100;

const bodySchema = z.object({
  currentChunk: z.string().min(1),
  recentContext: z.string().nullable().optional(),
  meetingMetadata: z
    .object({
      title: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      projectTitle: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  previousInsights: z
    .array(
      z.object({
        title: z.string(),
        category: z.string(),
        priority: z.string(),
      }),
    )
    .nullable()
    .optional(),
  /** Опційно: межі фрагмента в мс від початку наради. */
  sourceStartMs: z.number().int().nonnegative().optional(),
  sourceEndMs: z.number().int().nonnegative().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }
  void session;

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, title: true, description: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  if (data.currentChunk.trim().length < MIN_CHUNK_CHARS) {
    // Занадто короткий — не маємо що аналізувати, не палимо токени.
    return NextResponse.json({ insights: [], skipped: "too_short" });
  }

  // Серверний throttle — не дозволяємо викликати частіше ніж MIN_INTERVAL_MS.
  const lastLog = await prisma.liveAgentCostLog.findFirst({
    where: { meetingId: id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastLog) {
    const since = Date.now() - lastLog.createdAt.getTime();
    if (since < MIN_INTERVAL_MS) {
      return NextResponse.json({
        insights: [],
        skipped: "throttled",
        retryInMs: MIN_INTERVAL_MS - since,
      });
    }
  }

  let result;
  try {
    result = await analyzeChunk({
      currentChunk: data.currentChunk,
      recentContext: data.recentContext ?? null,
      meetingMetadata: {
        title: data.meetingMetadata?.title ?? meeting.title,
        description: data.meetingMetadata?.description ?? meeting.description,
        projectTitle: data.meetingMetadata?.projectTitle ?? null,
      },
      previousInsights: data.previousInsights ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Cost-лог завжди (навіть якщо інсайтів 0).
  await prisma.liveAgentCostLog.create({
    data: {
      meetingId: id,
      provider: result.usage.provider,
      model: result.usage.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      estimatedCostUsd:
        result.usage.estimatedCostUsd != null
          ? result.usage.estimatedCostUsd.toFixed(6)
          : null,
      latencyMs: result.usage.latencyMs,
    },
  });

  // Дедуп проти попередніх (з payload + з останніх 20 у БД).
  const existing = (
    await prisma.liveMeetingInsight.findMany({
      where: { meetingId: id, isHidden: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { title: true, category: true, priority: true },
    })
  ).concat(data.previousInsights ?? []);

  const created: typeof result.insights = [];
  for (const i of result.insights) {
    const ok = dedupeInsight(i, existing);
    if (!ok) continue;
    created.push(ok);
    existing.push({
      title: ok.title,
      category: ok.category,
      priority: ok.priority,
    });
  }

  // Зберігаємо в БД.
  const persisted = await Promise.all(
    created.map((i) =>
      prisma.liveMeetingInsight.create({
        data: {
          meetingId: id,
          category: i.category,
          priority: i.priority,
          title: i.title,
          summary: i.summary,
          suggestedQuestion: i.suggestedQuestion,
          actionItem: i.actionItem,
          suggestedResponses:
            (i.suggestedResponses as unknown as object) ?? undefined,
          confidence: i.confidence,
          sourceStartMs: data.sourceStartMs ?? null,
          sourceEndMs: data.sourceEndMs ?? null,
          rawAiResponse: i as unknown as object,
        },
      }),
    ),
  );

  // Дедуп і збереження glossary-термінів. У БД unique([meetingId, term]),
  // тож просто upsert. Це швидко і робота с бд.
  const persistedTerms = [];
  for (const t of result.glossaryTerms) {
    const term = (t.term ?? "").trim();
    const definition = (t.definition ?? "").trim();
    if (!term || !definition) continue;
    try {
      const row = await prisma.liveMeetingTerm.upsert({
        where: {
          meetingId_term: { meetingId: id, term },
        },
        create: {
          meetingId: id,
          term,
          definition,
          contextInMeeting: t.contextInMeeting ?? null,
        },
        update: {
          // Якщо вже є з тим самим терміном — лишаємо існуюче definition,
          // не переписуємо щоб не «розхитувати» поясненням.
        },
      });
      persistedTerms.push(row);
    } catch {
      /* ignore individual term failures */
    }
  }

  return NextResponse.json({
    insights: persisted,
    glossaryTerms: persistedTerms,
    usage: result.usage,
  });
}
