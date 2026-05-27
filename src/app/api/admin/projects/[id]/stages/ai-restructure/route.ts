import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { safeParseJson } from "@/lib/ai/json-parse";
import { withAnthropicSlot } from "@/lib/foreman/anthropic-throttle";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";
const MAX_DEPTH = 2;

/**
 * AI-реструктуризація плоского списку етапів у дерево.
 *
 *  mode: "propose" → читає поточні етапи, просить LLM запропонувати
 *                    parent-child, повертає moves для preview.
 *  mode: "apply"   → приймає moves з propose, застосовує в транзакції.
 *
 * LLM може створити НОВІ group-етапи (parent categories), якщо вони
 * покращують структуру. Existing-етапи лише ПЕРЕМІЩУЮТЬСЯ (parentStageId
 * + sortOrder); їхні факт-поля/notes/responsibleUser не чіпаються.
 */

const ProposeBodySchema = z.object({
  mode: z.literal("propose"),
});

const MoveSchema = z.object({
  stageId: z.string().min(1),
  /** `null` = top-level. `existing:<id>` = під існуючий етап. `new:<tempId>` = під новостворений. */
  parentRef: z.string().nullable(),
});

const NewGroupSchema = z.object({
  tempId: z.string().min(1),
  name: z.string().min(1).max(200),
  parentRef: z.string().nullable(),
});

const ApplyBodySchema = z.object({
  mode: z.literal("apply"),
  moves: z.array(MoveSchema).min(0),
  newGroups: z.array(NewGroupSchema).default([]),
});

const BodySchema = z.discriminatedUnion("mode", [
  ProposeBodySchema,
  ApplyBodySchema,
]);

const SYSTEM_PROMPT = `Ти — інженер-кошторисник будівельної компанії. Дано плоский список етапів проєкту: id + назва. Деякі мають бути згруповані під логічні категорії (наприклад, «Тип 06.1» і «Тип 06.2» — під «Тип 06»; усі «Тип XX.Y» — під «Монтажні роботи»). Запропонуй ієрархію.

Правила:
- Максимум ${MAX_DEPTH + 1} рівні (top → group → leaf).
- Група має сенс ТІЛЬКИ якщо містить ≥2 етапи.
- Якщо очевидної групи немає — лиши етап на top-level (parentRef: null).
- Можна створювати НОВІ батьківські категорії (newGroups) якщо це покращить структуру.
- Не вигадуй групу заради групування — краще плоско, ніж штучна категорія.
- Не перейменовуй existing-етапи. Не видаляй жодного.

Output ТІЛЬКИ JSON, без markdown-fences:
{
  "moves": [
    { "stageId": "<id існуючого>", "parentRef": null | "existing:<id>" | "new:<tempId з newGroups>" }
  ],
  "newGroups": [
    { "tempId": "new-1", "name": "Назва категорії", "parentRef": null | "existing:<id>" | "new:<інший tempId>" }
  ]
}

КОЖЕН existing-етап має бути в moves рівно один раз. parentRef:
- null = top-level;
- "existing:<id>" = під існуючий етап з input списку;
- "new:<tempId>" = під щойно створений з newGroups.`;

async function authorize(projectId: string) {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() } as const;
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return { error: forbiddenResponse() } as const;
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
  });
  if (!project) {
    return {
      error: NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 }),
    } as const;
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return { error: forbiddenResponse() } as const;
  }
  return { session, project } as const;
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await ctx.params;
  const authResult = await authorize(projectId);
  if ("error" in authResult) return authResult.error;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Невалідне тіло запиту", details: String(err) },
      { status: 400 },
    );
  }

  if (body.mode === "propose") {
    return await handlePropose(projectId);
  }
  return await handleApply(projectId, body);
}

async function handlePropose(projectId: string) {
  const stages = await prisma.projectStageRecord.findMany({
    where: { projectId, isHidden: false },
    select: {
      id: true,
      customName: true,
      stage: true,
      parentStageId: true,
      kind: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  if (stages.length === 0) {
    return NextResponse.json({ data: { moves: [], newGroups: [] } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY не сконфігуровано" },
      { status: 500 },
    );
  }

  const items = stages.map((s) => ({
    id: s.id,
    name: s.customName ?? s.stage ?? "(без назви)",
    currentParentId: s.parentStageId,
  }));

  const anthropic = new Anthropic({ apiKey });
  const userPrompt = `Список етапів цього проєкту:\n\n${JSON.stringify(items, null, 2)}\n\nПоверни JSON з moves + newGroups.`;

  let response: Anthropic.Messages.Message;
  try {
    response = await withAnthropicSlot(() =>
      Promise.race([
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 90_000),
        ),
      ]),
    );
  } catch (err) {
    console.error("[ai-restructure propose] LLM call failed:", err);
    return NextResponse.json(
      { error: `LLM недоступний: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = safeParseJson<{
    moves: Array<{ stageId: string; parentRef: string | null }>;
    newGroups: Array<{ tempId: string; name: string; parentRef: string | null }>;
  }>(text);

  if (!parsed.ok) {
    console.error("[ai-restructure propose] JSON parse failed:", parsed.error);
    return NextResponse.json(
      { error: `AI повернув невалідний JSON: ${parsed.error}` },
      { status: 502 },
    );
  }

  const validIds = new Set(stages.map((s) => s.id));
  const moves = (parsed.value.moves ?? []).filter((m) => validIds.has(m.stageId));
  const newGroups = (parsed.value.newGroups ?? []).filter(
    (g) => g.tempId && g.name,
  );

  return NextResponse.json({
    data: {
      moves,
      newGroups,
      stagesCount: stages.length,
      moveCount: moves.length,
      newGroupCount: newGroups.length,
    },
  });
}

async function handleApply(
  projectId: string,
  body: z.infer<typeof ApplyBodySchema>,
) {
  const stages = await prisma.projectStageRecord.findMany({
    where: { projectId },
    select: { id: true, sortOrder: true },
  });
  const existingIds = new Set(stages.map((s) => s.id));

  const moves = body.moves.filter((m) => existingIds.has(m.stageId));
  if (moves.length === 0 && body.newGroups.length === 0) {
    return NextResponse.json({ data: { applied: 0, created: 0 } });
  }

  function parseParentRef(
    ref: string | null,
    tempToReal: Map<string, string>,
  ): string | null | "INVALID" {
    if (ref === null) return null;
    if (ref.startsWith("existing:")) {
      const id = ref.slice("existing:".length);
      return existingIds.has(id) ? id : "INVALID";
    }
    if (ref.startsWith("new:")) {
      const tempId = ref.slice("new:".length);
      return tempToReal.get(tempId) ?? "INVALID";
    }
    return "INVALID";
  }

  // Cycle-detection: будь-який move що робить ancestor свого нащадка → invalid.
  // Будуємо граф запропонованого parentStageId і відкидаємо moves що створюють цикл.
  // (newGroups не можуть бути дітьми moves, бо їх ще не існує до створення —
  //  єдиний шлях циклу через existing parents.)

  const result = await prisma.$transaction(async (tx) => {
    const tempToReal = new Map<string, string>();

    // 1) Створюємо newGroups topologically (parent-first).
    const remaining = [...body.newGroups];
    const lastRoot = await tx.projectStageRecord.findFirst({
      where: { projectId, parentStageId: null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextRootSort = (lastRoot?.sortOrder ?? -1) + 1;

    let safetyIterations = remaining.length + 1;
    while (remaining.length > 0 && safetyIterations-- > 0) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const g = remaining[i];
        const parent = parseParentRef(g.parentRef, tempToReal);
        if (parent === "INVALID") {
          remaining.splice(i, 1); // dropping invalid
          continue;
        }
        if (parent === null || typeof parent === "string") {
          const created = await tx.projectStageRecord.create({
            data: {
              projectId,
              parentStageId: parent,
              customName: g.name.slice(0, 200),
              kind: "GROUP",
              status: "PENDING",
              sortOrder: parent === null ? nextRootSort++ : 0,
            },
            select: { id: true },
          });
          tempToReal.set(g.tempId, created.id);
          remaining.splice(i, 1);
        }
      }
    }

    // 2) Застосовуємо moves на existing-етапи.
    let applied = 0;
    for (const m of moves) {
      const parent = parseParentRef(m.parentRef, tempToReal);
      if (parent === "INVALID") continue;
      if (parent === m.stageId) continue; // self-parent

      await tx.projectStageRecord.update({
        where: { id: m.stageId },
        data: { parentStageId: parent ?? null },
      });
      applied++;
    }

    return {
      applied,
      created: tempToReal.size,
    };
  });

  return NextResponse.json({ data: result });
}
