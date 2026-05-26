import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { canCreateCO } from "@/lib/change-orders/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SuggestBody = { chatId: string; projectId: string };

type AiItem = {
  costCodeHint?: string;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
};

type AiDraft = {
  type: "ADD" | "REMOVE" | "SWAP";
  title: string;
  description: string;
  reasonFromClient?: string;
  scheduleImpactDays?: number;
  items: AiItem[];
  confidence: number;
};

const PROMPT = `Ти асистент керівника проєкту в українській будівельній компанії.
На основі останніх повідомлень чату з клієнтом, визнач, чи містить діалог
запит на ЗМІНУ ОБСЯГУ робіт (додати/прибрати/замінити). Якщо так — поверни
JSON-чернетку Додаткової Угоди. Якщо ні — поверни null.

Формат відповіді — ТІЛЬКИ валідний JSON, без markdown:
{
  "type": "ADD"|"REMOVE"|"SWAP",
  "title": "Стисла назва зміни",
  "description": "Детальний опис змін",
  "reasonFromClient": "Дослівна цитата клієнта (опціонально)",
  "scheduleImpactDays": 0,
  "items": [
    {
      "costCodeHint": "ключове слово для пошуку cost code (напр. 'електромонтаж', 'сантехніка')",
      "description": "Що саме",
      "unit": "шт"|"м"|"м2"|"м3"|"к-т",
      "qty": 1,
      "unitPrice": 0
    }
  ],
  "confidence": 0.0-1.0
}

Якщо невпевнений у ціні — постав 0 (PM відредагує). Завжди українською.`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !canCreateCO(role)) return forbiddenResponse();

  const body = (await req.json()) as SuggestBody;
  if (!body.chatId || !body.projectId)
    return NextResponse.json({ error: "chatId+projectId-required" }, { status: 400 });

  // Verify project belongs to firm.
  const project = await prisma.project.findFirst({
    where: { id: body.projectId, firmId: firmId ?? undefined },
    select: { id: true, title: true },
  });
  if (!project) return forbiddenResponse();

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: body.chatId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { body: true, createdAt: true, authorId: true },
  });
  if (messages.length === 0)
    return NextResponse.json({ draft: null, reason: "no-messages" });

  const transcript = messages
    .reverse()
    .map((m) => `[${m.authorId.slice(0, 6)}]: ${m.body}`)
    .join("\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "ai-not-configured" }, { status: 503 });

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: PROMPT,
    messages: [
      {
        role: "user",
        content: `Проєкт: ${project.title}\n\nПовідомлення чату:\n${transcript}`,
      },
    ],
  });
  const text =
    response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

  let draft: AiDraft | null = null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.type)
      draft = parsed as AiDraft;
  } catch {
    /* leave draft null */
  }
  if (!draft) return NextResponse.json({ draft: null });

  // Fuzzy-match costCodeHint → costCodeId for each item.
  const costCodes = await prisma.costCode.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  });
  const resolved = draft.items.map((it) => {
    const hint = (it.costCodeHint ?? "").toLowerCase().trim();
    let match: { id: string; code: string; name: string } | null = null;
    if (hint) {
      match =
        costCodes.find((c) => c.name.toLowerCase().includes(hint)) ??
        costCodes.find((c) => c.code.toLowerCase().includes(hint)) ??
        null;
    }
    return {
      ...it,
      sign: draft.type === "REMOVE" ? -1 : 1,
      costCodeId: match?.id ?? null,
      costCodeLabel: match ? `${match.code} · ${match.name}` : null,
    };
  });

  return NextResponse.json({
    draft: {
      ...draft,
      items: resolved,
      sourceChatId: body.chatId,
    },
  });
}
