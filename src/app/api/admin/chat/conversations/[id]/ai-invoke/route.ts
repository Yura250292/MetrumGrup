import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { postMessage } from "@/lib/chat/service";
import { runAiReply, type AiModelChoice } from "@/lib/chat/ai-run";

const VALID_MODELS: AiModelChoice[] = ["gpt-4o", "gpt-4o-mini", "gemini-2.5-flash"];

function isValidModel(v: unknown): v is AiModelChoice {
  return typeof v === "string" && (VALID_MODELS as string[]).includes(v);
}

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id: conversationId } = await ctx.params;

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model: AiModelChoice = isValidModel(body.model) ? body.model : "gpt-4o";

    if (!prompt) {
      return NextResponse.json({ error: "prompt обов'язковий" }, { status: 400 });
    }
    if (prompt.length > 4000) {
      return NextResponse.json(
        { error: "Запит занадто довгий (макс 4000)" },
        { status: 400 },
      );
    }

    // Participant-guard (postMessage checks the same, but we want a clean
    // 403 before hitting the model).
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: session.user.id,
        },
      },
      select: { conversationId: true },
    });
    if (!participant) return forbiddenResponse();

    // 1. Publish the user's prompt as a regular chat message prefixed with
    //    "@ai " so the AI provenance is visible in the thread. Skip the
    //    built-in @ai handler so we don't double-fire.
    const visibleBody = prompt.toLowerCase().startsWith("@ai ")
      ? prompt
      : `@ai ${prompt}`;
    const userMessage = await postMessage(
      conversationId,
      session.user.id,
      visibleBody,
      [],
      { skipAiMention: true },
    );

    // 2. Run the selected model and publish the AI reply.
    const aiMessage = await runAiReply({
      conversationId,
      prompt,
      model,
    });

    return NextResponse.json({
      userMessage,
      aiMessageId: aiMessage?.id ?? null,
      model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/ai-invoke] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
