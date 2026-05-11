import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { chatWithAgent, type ChatMessage } from "@/lib/meetings/live-agent";
import { ragSearch, isProjectVectorized } from "@/lib/rag/vectorizer";

export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(40)
    .optional(),
});

// POST /api/admin/meetings/[id]/live-agent/chat
// Body: { message, history? }
// Free-form чат з агентом, що бачить транскрипт + останні інсайти + RAG.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      projectId: true,
      transcript: true,
      project: { select: { id: true, title: true } },
    },
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

  const userMessage = parsed.data.message;
  const history: ChatMessage[] = parsed.data.history ?? [];

  // Останні 10 інсайтів.
  const recentInsights = await prisma.liveMeetingInsight.findMany({
    where: { meetingId: id, isHidden: false },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { category: true, priority: true, title: true, summary: true },
  });

  // RAG: пошук релевантних фрагментів за userMessage (а не за транскриптом
  // як у /analyze) — бо тут юзер сам формулює запит.
  let projectFiles: Array<{
    fileName: string;
    content: string;
    similarity: number;
  }> = [];
  if (meeting.projectId) {
    try {
      const vectorized = await isProjectVectorized(meeting.projectId);
      if (vectorized) {
        const matches = await ragSearch(userMessage, meeting.projectId, 4, 0.5);
        projectFiles = matches.map((m) => ({
          fileName: m.fileName,
          content: m.content,
          similarity: m.similarity,
        }));
      }
    } catch (err) {
      console.warn("[live-agent/chat] RAG failed (non-blocking):", err);
    }
  }

  // Транскрипт — останній шматок (~4000 chars).
  const transcriptSnippet = meeting.transcript ?? null;

  let result;
  try {
    result = await chatWithAgent({
      userMessage,
      history,
      meetingMetadata: {
        title: meeting.title,
        description: meeting.description,
        projectTitle: meeting.project?.title ?? null,
      },
      transcriptSnippet,
      recentInsights: recentInsights.map((i) => ({
        category: i.category,
        priority: i.priority,
        title: i.title,
        summary: i.summary,
      })),
      projectFiles,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Cost-лог (як для analyze) — щоб бачити витрати по chat теж.
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

  return NextResponse.json({
    reply: result.reply,
    usedFiles: projectFiles.map((f) => ({
      fileName: f.fileName,
      similarity: f.similarity,
    })),
    usage: result.usage,
  });
}
