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

// Запропонований AI новий етап. tempId використовується щоб посилатись на нього
// з mapping-ів і дочірніх стейджів до того як він збережений у БД.
type ProposedStage = {
  tempId: string;
  name: string;
  parentTempId: string | null;
  notes?: string | null;
  entryIds: string[];
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

  const systemPrompt = `Ти — досвідчений економіст-кошторисник будівельної компанії. Завдання: розподіли всі фінансові записи проекту "${project.title}" по етапах виконання робіт.

Думай покроково:
1) Прочитай кожен запис: title, description, category, type (INCOME/EXPENSE), kind (PLAN/FACT), сума, контрагент.
2) Зрозумій який це етап будівельного циклу. Типова послідовність: Демонтаж → Підготовка майданчика → Котлован/Фундамент → Каркас/Стіни → Перекриття → Дах → Інженерні мережі (електрика, сантехніка, вентиляція) → Чорнові оздоблювальні → Чистові оздоблювальні → Здача об'єкта.
3) Якщо існуючі етапи проекту вже покривають запис — використай їх stageRecordId.
4) Якщо існуючих етапів не вистачає — запропонуй нові у proposedNewStages з осмисленими назвами і групуванням у підетапи (parent → child) де доцільно. Наприклад "Інженерія" як батьківський, з "Електрика", "Сантехніка", "Вентиляція" як підетапи.
5) Доходи (INCOME — аванси, оплата клієнта) зазвичай НЕ привʼязуються до етапу і йдуть як stageRecordId=null.
6) PROJECT_BUDGET плани вже виключені — не повертай їх.

Відповідай ТІЛЬКИ JSON:
{
  "suggestions": [
    {"entryId":"<id>", "stageRecordId":"<existing-id-or-tempId-or-null>", "reasoning":"коротке пояснення"}
  ],
  "proposedNewStages": [
    {"tempId":"new-1", "name":"Назва етапу", "parentTempId": null|"<інший-tempId>", "notes":"опис", "entryIds":["<id>","<id>"]}
  ]
}

Правила tempId: префікс "new-", унікальний. Якщо запис віднесено до нового стейджу — у suggestions поле stageRecordId = tempId цього стейджу.`;

  const userPrompt = `Існуючі етапи проекту (можуть бути порожні):\n${JSON.stringify(stagesPayload, null, 2)}\n\nЗаписи фінансування для розподілу:\n${JSON.stringify(entriesPayload, null, 2)}`;

  let suggestions: Suggestion[] = [];
  let proposedNewStages: ProposedStage[] = [];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const existingStageIds = new Set(stages.map((s) => s.id));
    const entryIds = new Set(entries.map((e) => e.id));

    // 1) Витягуємо запропоновані нові стейджі (валідуємо tempId, унікальність).
    const seenTempIds = new Set<string>();
    if (Array.isArray(parsed.proposedNewStages)) {
      for (const ns of parsed.proposedNewStages) {
        if (
          ns &&
          typeof ns.tempId === "string" &&
          ns.tempId.startsWith("new-") &&
          !seenTempIds.has(ns.tempId) &&
          typeof ns.name === "string" &&
          ns.name.trim()
        ) {
          seenTempIds.add(ns.tempId);
          proposedNewStages.push({
            tempId: ns.tempId,
            name: ns.name.trim(),
            parentTempId:
              typeof ns.parentTempId === "string" && ns.parentTempId.startsWith("new-")
                ? ns.parentTempId
                : null,
            notes: typeof ns.notes === "string" ? ns.notes : null,
            entryIds: Array.isArray(ns.entryIds)
              ? ns.entryIds.filter((id: unknown) => typeof id === "string" && entryIds.has(id))
              : [],
          });
        }
      }
    }

    // 2) Mappings — stageRecordId може бути existing id АБО tempId з proposedNewStages АБО null.
    if (Array.isArray(parsed.suggestions)) {
      suggestions = parsed.suggestions
        .filter(
          (s: { entryId?: unknown }) =>
            typeof s.entryId === "string" && entryIds.has(s.entryId),
        )
        .map((s: { entryId: string; stageRecordId?: string | null; reasoning?: string }) => {
          let sid: string | null = null;
          if (typeof s.stageRecordId === "string") {
            if (existingStageIds.has(s.stageRecordId) || seenTempIds.has(s.stageRecordId)) {
              sid = s.stageRecordId;
            }
          }
          return {
            entryId: s.entryId,
            stageRecordId: sid,
            reasoning: typeof s.reasoning === "string" ? s.reasoning : undefined,
          };
        });
    }

    // 3) Доповнюємо suggestions з proposedNewStages.entryIds (якщо AI забув продублювати).
    for (const ns of proposedNewStages) {
      for (const eid of ns.entryIds) {
        if (!suggestions.find((s) => s.entryId === eid)) {
          suggestions.push({ entryId: eid, stageRecordId: ns.tempId });
        }
      }
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
      proposedNewStages,
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

  const body = (await request.json()) as {
    mappings?: Suggestion[];
    newStages?: ProposedStage[];
  };
  const mappings = Array.isArray(body.mappings) ? body.mappings : [];
  const newStagesInput = Array.isArray(body.newStages) ? body.newStages : [];
  if (mappings.length === 0 && newStagesInput.length === 0) {
    return NextResponse.json({ error: "Порожній mapping" }, { status: 400 });
  }

  // Перевіряємо що entries належать цьому проекту і stage IDs валідні.
  const entryIds = mappings.map((m) => m.entryId);
  const existingStageIds = mappings
    .map((m) => m.stageRecordId)
    .filter(
      (s): s is string => typeof s === "string" && !s.startsWith("new-"),
    );

  const [entries, existingStages] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { id: { in: entryIds }, projectId },
      select: { id: true },
    }),
    existingStageIds.length > 0
      ? prisma.projectStageRecord.findMany({
          where: { id: { in: existingStageIds }, projectId },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const validEntryIds = new Set(entries.map((e) => e.id));
  const validExistingStageIds = new Set(existingStages.map((s) => s.id));

  let updated = 0;
  let createdStages = 0;
  await prisma.$transaction(async (tx) => {
    // 1) Створюємо нові стейджі (батьки спочатку — топологічний обхід).
    // Map tempId → real id після створення.
    const tempToReal = new Map<string, string>();

    // Базовий sortOrder після останнього існуючого top-level.
    const last = await tx.projectStageRecord.findFirst({
      where: { projectId, parentStageId: null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextSort = (last?.sortOrder ?? -1) + 1;

    const stagesByTempId = new Map<string, ProposedStage>();
    for (const ns of newStagesInput) {
      if (
        ns &&
        typeof ns.tempId === "string" &&
        ns.tempId.startsWith("new-") &&
        typeof ns.name === "string" &&
        ns.name.trim()
      ) {
        stagesByTempId.set(ns.tempId, ns);
      }
    }

    async function createStage(tempId: string, depth = 0): Promise<string | null> {
      if (depth > 3) return null; // safety
      const real = tempToReal.get(tempId);
      if (real) return real;
      const ns = stagesByTempId.get(tempId);
      if (!ns) return null;
      let parentId: string | null = null;
      if (ns.parentTempId && stagesByTempId.has(ns.parentTempId)) {
        parentId = await createStage(ns.parentTempId, depth + 1);
      }
      const created = await tx.projectStageRecord.create({
        data: {
          projectId,
          customName: ns.name.trim(),
          stage: null,
          status: "PENDING",
          progress: 0,
          notes: ns.notes ?? null,
          parentStageId: parentId,
          sortOrder: parentId ? 0 : nextSort++,
        },
        select: { id: true },
      });
      tempToReal.set(tempId, created.id);
      createdStages++;
      return created.id;
    }

    for (const tempId of stagesByTempId.keys()) {
      await createStage(tempId);
    }

    // 2) Застосовуємо mappings — резолвимо tempId через tempToReal.
    for (const m of mappings) {
      if (!validEntryIds.has(m.entryId)) continue;
      let stageId: string | null = null;
      if (m.stageRecordId) {
        if (m.stageRecordId.startsWith("new-")) {
          stageId = tempToReal.get(m.stageRecordId) ?? null;
        } else if (validExistingStageIds.has(m.stageRecordId)) {
          stageId = m.stageRecordId;
        }
      }
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

  return NextResponse.json({ data: { updated, createdStages } });
}
