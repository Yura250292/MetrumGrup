import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
  assertCanAccessFirm,
} from "@/lib/firm/scope";
import { syncProjectBudgetEntry } from "@/lib/folders/mirror-service";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

type Suggestion = {
  entryId: string;
  stageRecordId: string | null;
  reasoning?: string;
};

/**
 * GET — AI пропонує mapping FinanceEntry → ProjectStageRecord.
 *      Повертає preview для UI без збереження.
 *
 * POST — застосовує переданий mapping (масив { entryId, stageRecordId | null }).
 *      Оновлює FinanceEntry.stageRecordId, перераховує allocatedBudget кожного
 *      стейджу як SUM PLAN-EXPENSE його записів, оновлює Project.totalBudget,
 *      синхронізує PROJECT_BUDGET FinanceEntry.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, firmId: true, description: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER" && activeRole !== "FINANCIER") {
    return forbiddenResponse();
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  // Зразок: всі етапи проекту (включно з підетапами) + всі FinanceEntry проекту
  // без stageRecordId або системні (PROJECT_BUDGET).
  const [stages, entries] = await Promise.all([
    prisma.projectStageRecord.findMany({
      where: { projectId, isHidden: false },
      orderBy: [{ parentStageId: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        stage: true,
        customName: true,
        parentStageId: true,
        notes: true,
        allocatedBudget: true,
      },
    }),
    prisma.financeEntry.findMany({
      where: {
        projectId,
        isArchived: false,
        source: { not: "PROJECT_BUDGET" },
        stageRecordId: null,
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        subcategory: true,
        type: true,
        kind: true,
        amount: true,
        counterparty: true,
      },
      take: 100,
    }),
  ]);

  if (entries.length === 0 || stages.length === 0) {
    return NextResponse.json({
      data: { suggestions: [], stages, entries },
      info:
        entries.length === 0
          ? "Немає фінансових записів для розподілу"
          : "У проекті немає етапів — створи їх перш ніж синхронізувати",
    });
  }

  const stagesPayload = stages.map((s) => ({
    id: s.id,
    name: s.customName ?? s.stage ?? "Без назви",
    parentId: s.parentStageId,
    notes: s.notes,
  }));
  const entriesPayload = entries.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category,
    subcategory: e.subcategory,
    type: e.type, // INCOME | EXPENSE
    kind: e.kind, // PLAN | FACT
    amount: Number(e.amount),
    counterparty: e.counterparty,
  }));

  const systemPrompt = `Ти — асистент будівельної компанії. Розподіли фінансові записи проекту "${project.title}" по його етапах. Поверни JSON масив з полями entryId і stageRecordId (або null якщо запис не належить жодному з етапів — наприклад загальні аванси клієнта). Враховуй:
- title/description/category запису
- назву етапу (Демонтаж, Фундамент, Стіни, Дах, Інженерія, Оздоблення, Здача тощо)
- direction (INCOME — зазвичай аванси, не привʼязані до етапу; EXPENSE — конкретний етап)
Відповідай ТІЛЬКИ JSON у вигляді {"suggestions":[{"entryId":"...","stageRecordId":"..."|null,"reasoning":"коротко чому"}]}`;

  const userPrompt = `Етапи проекту:\n${JSON.stringify(stagesPayload, null, 2)}\n\nЗаписи фінансування:\n${JSON.stringify(entriesPayload, null, 2)}`;

  let suggestions: Suggestion[] = [];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.suggestions)) {
      const stageIds = new Set(stages.map((s) => s.id));
      const entryIds = new Set(entries.map((e) => e.id));
      suggestions = parsed.suggestions
        .filter(
          (s: { entryId?: unknown; stageRecordId?: unknown }) =>
            typeof s.entryId === "string" && entryIds.has(s.entryId),
        )
        .map((s: { entryId: string; stageRecordId?: string | null; reasoning?: string }) => ({
          entryId: s.entryId,
          stageRecordId:
            typeof s.stageRecordId === "string" && stageIds.has(s.stageRecordId)
              ? s.stageRecordId
              : null,
          reasoning: typeof s.reasoning === "string" ? s.reasoning : undefined,
        }));
    }
  } catch (err) {
    console.error("[sync-finance/AI] error:", err);
    return NextResponse.json(
      { error: "AI не зміг обробити запит. Спробуй пізніше." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: {
      suggestions,
      stages: stagesPayload,
      entries: entriesPayload,
    },
  });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER" && activeRole !== "FINANCIER") {
    return forbiddenResponse();
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const body = (await request.json()) as { mappings?: Suggestion[] };
  const mappings = Array.isArray(body.mappings) ? body.mappings : [];
  if (mappings.length === 0) {
    return NextResponse.json({ error: "Порожній mapping" }, { status: 400 });
  }

  // Перевіряємо що entries належать цьому проекту і stage IDs валідні.
  const entryIds = mappings.map((m) => m.entryId);
  const stageIds = mappings
    .map((m) => m.stageRecordId)
    .filter((s): s is string => typeof s === "string");

  const [entries, stages] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { id: { in: entryIds }, projectId },
      select: { id: true },
    }),
    stageIds.length > 0
      ? prisma.projectStageRecord.findMany({
          where: { id: { in: stageIds }, projectId },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const validEntryIds = new Set(entries.map((e) => e.id));
  const validStageIds = new Set(stages.map((s) => s.id));

  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const m of mappings) {
      if (!validEntryIds.has(m.entryId)) continue;
      const stageId =
        m.stageRecordId && validStageIds.has(m.stageRecordId)
          ? m.stageRecordId
          : null;
      await tx.financeEntry.update({
        where: { id: m.entryId },
        data: { stageRecordId: stageId },
      });
      updated++;
    }

    // Перерахунок allocatedBudget кожного top-level stage = SUM PLAN-EXPENSE
    // FinanceEntry з stageRecordId = stage_id АБО stageRecord.parentStageId = stage_id
    // (тобто включаємо записи прив'язані до підетапів).
    const allStages = await tx.projectStageRecord.findMany({
      where: { projectId },
      select: { id: true, parentStageId: true },
    });
    const childrenOf = new Map<string, string[]>();
    for (const s of allStages) {
      if (s.parentStageId) {
        const arr = childrenOf.get(s.parentStageId) ?? [];
        arr.push(s.id);
        childrenOf.set(s.parentStageId, arr);
      }
    }
    function descendantsIncludingSelf(rootId: string): string[] {
      const out: string[] = [];
      const stack = [rootId];
      while (stack.length > 0) {
        const id = stack.pop()!;
        out.push(id);
        const kids = childrenOf.get(id);
        if (kids) stack.push(...kids);
      }
      return out;
    }

    for (const s of allStages) {
      const ids = descendantsIncludingSelf(s.id);
      const agg = await tx.financeEntry.aggregate({
        where: {
          projectId,
          stageRecordId: { in: ids },
          kind: "PLAN",
          type: "EXPENSE",
          isArchived: false,
        },
        _sum: { amount: true },
      });
      const sum = Number(agg._sum.amount ?? 0);
      await tx.projectStageRecord.update({
        where: { id: s.id },
        data: { allocatedBudget: sum > 0 ? sum : null },
      });
    }

    // Project.totalBudget = SUM allocatedBudget top-level стейджів.
    const topLevel = await tx.projectStageRecord.findMany({
      where: { projectId, parentStageId: null, isHidden: false },
      select: { allocatedBudget: true },
    });
    const total = topLevel.reduce(
      (sum, s) => sum + Number(s.allocatedBudget ?? 0),
      0,
    );
    if (total > 0) {
      await tx.project.update({
        where: { id: projectId },
        data: { totalBudget: total },
      });
    }
  });

  // Refresh PROJECT_BUDGET FinanceEntry поза транзакцією, щоб mirror-папка та
  // FinanceEntry оновились після коміту.
  try {
    await syncProjectBudgetEntry(projectId, session.user.id);
  } catch (err) {
    console.error("[sync-finance/POST] syncProjectBudgetEntry failed:", err);
  }

  return NextResponse.json({ data: { updated } });
}
