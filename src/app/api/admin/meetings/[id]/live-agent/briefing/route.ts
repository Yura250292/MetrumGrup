import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { generateBriefing } from "@/lib/meetings/live-agent";

export const maxDuration = 60;

// GET — повертає кешований briefing якщо є.
export async function GET(
  _request: NextRequest,
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
    select: { liveBriefing: true, liveBriefingGeneratedAt: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    briefing: meeting.liveBriefing,
    generatedAt: meeting.liveBriefingGeneratedAt,
  });
}

// POST — генерує briefing (або перегенеровує). Body порожній.
export async function POST(
  _request: NextRequest,
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
    include: {
      project: {
        select: { id: true, title: true, address: true },
      },
    },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Підтягуємо останні наради цього ж проєкту (або з тієї ж папки якщо
  // нарада не привʼязана до проєкту) для контексту.
  const recentMeetings = await prisma.meeting.findMany({
    where: {
      id: { not: id },
      OR: [
        meeting.projectId
          ? { projectId: meeting.projectId }
          : { folderId: meeting.folderId },
      ],
    },
    orderBy: { recordedAt: "desc" },
    take: 5,
    select: { title: true, summary: true },
  });

  // Відкриті (не виконані і не архівовані) задачі по проєкту.
  const openTasksRaw = meeting.projectId
    ? await prisma.task.findMany({
        where: {
          projectId: meeting.projectId,
          completedAt: null,
          isArchived: false,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { title: true, status: { select: { name: true } } },
      })
    : [];
  const openTasks = openTasksRaw.map((t) => ({
    title: t.title,
    status: t.status?.name ?? null,
  }));

  let briefing: string;
  let usage;
  try {
    const result = await generateBriefing({
      title: meeting.title,
      description: meeting.description,
      projectTitle: meeting.project?.title ?? null,
      projectAddress: meeting.project?.address ?? null,
      recentMeetings,
      openTasks,
    });
    briefing = result.briefing;
    usage = result.usage;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI failed" },
      { status: 500 },
    );
  }

  // Зберігаємо у кеш + додаємо cost-лог.
  const generatedAt = new Date();
  await Promise.all([
    prisma.meeting.update({
      where: { id },
      data: {
        liveBriefing: briefing,
        liveBriefingGeneratedAt: generatedAt,
      },
    }),
    prisma.liveAgentCostLog.create({
      data: {
        meetingId: id,
        provider: usage.provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd:
          usage.estimatedCostUsd != null
            ? usage.estimatedCostUsd.toFixed(6)
            : null,
        latencyMs: usage.latencyMs,
      },
    }),
  ]);

  return NextResponse.json({ briefing, generatedAt });
}
