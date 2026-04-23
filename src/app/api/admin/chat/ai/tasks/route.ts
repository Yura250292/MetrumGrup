import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
  requireStaffAccess,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

type StructuredTask = {
  title: string;
  priority: "P1" | "P2" | "P3";
  assigneeId: string | null;
  assigneeName: string | null;
  notes: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffAccess();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не налаштований" },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!conversationId || !text) {
      return NextResponse.json(
        { error: "conversationId та text обов'язкові" },
        { status: 400 },
      );
    }
    if (text.length > 6000) {
      return NextResponse.json(
        { error: "Текст занадто довгий (макс 6000)" },
        { status: 400 },
      );
    }

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

    // Provide the model with participants of this conversation so it can
    // guess assignees by name (but never invent a user).
    const members = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      include: { user: { select: { id: true, name: true } } },
    });
    const membersList = members
      .map((m) => `- ${m.user.name} (id: ${m.user.id})`)
      .join("\n");

    const systemPrompt =
      "Ти структуруєш робочий текст у масив задач. Відповідай українською. Поверни JSON об'єкт {\"tasks\": [...]}. Кожна задача: { \"title\": string (до 120 символів, дієслово), \"priority\": \"P1\"|\"P2\"|\"P3\" (P1 - критично/терміново, P2 - звичайно, P3 - бажано), \"assigneeId\": string|null (айді з наданого списку учасників; null якщо не згадано), \"notes\": string|null (коротке уточнення або контекст, без повторення title) }. Якщо задач немає — поверни {\"tasks\": []}. НЕ додавай inші поля. НЕ вигадуй людей поза списком учасників.";

    const userPrompt = `Учасники розмови:\n${membersList || "(немає даних)"}\n\nТекст:\n${text}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      return NextResponse.json(
        { error: "Порожня відповідь від моделі" },
        { status: 502 },
      );
    }

    let parsed: { tasks?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Модель повернула некоректний JSON" },
        { status: 502 },
      );
    }

    const memberNameById = new Map(members.map((m) => [m.user.id, m.user.name]));

    const tasksInput = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const tasks: StructuredTask[] = tasksInput
      .map((t): StructuredTask | null => {
        if (!t || typeof t !== "object") return null;
        const obj = t as Record<string, unknown>;
        const title = typeof obj.title === "string" ? obj.title.trim() : "";
        if (!title) return null;
        const priority =
          obj.priority === "P1" || obj.priority === "P2" || obj.priority === "P3"
            ? obj.priority
            : "P2";
        const assigneeRaw = typeof obj.assigneeId === "string" ? obj.assigneeId : null;
        const assigneeId =
          assigneeRaw && memberNameById.has(assigneeRaw) ? assigneeRaw : null;
        const assigneeName = assigneeId ? memberNameById.get(assigneeId) ?? null : null;
        const notes =
          typeof obj.notes === "string" && obj.notes.trim().length > 0
            ? obj.notes.trim()
            : null;
        return { title: title.slice(0, 200), priority, assigneeId, assigneeName, notes };
      })
      .filter((t): t is StructuredTask => t !== null)
      .slice(0, 20);

    return NextResponse.json({ tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/ai/tasks] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
