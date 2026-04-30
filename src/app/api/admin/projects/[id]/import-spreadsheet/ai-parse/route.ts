import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

type AiNode = {
  tempId: string;
  parentTempId: string | null;
  customName: string;
  isSection: boolean;
  unit: string | null;
  planVolume: number | null;
  planUnitPrice: number | null;
  planClientUnitPrice: number | null;
  responsibleHint: string | null;
  sourceLine: number;
};

/**
 * AI-парсер пасту з Excel/Google Sheets/Word/довільного тексту → дерево
 * стейджів. Використовує GPT-4o, який стійкіший до криваво форматованих
 * таблиць (різний порядок колонок, об'єднані cells, multi-row headers).
 *
 * Повертає той самий формат, що і heuristic-парсер — UI-modal може feed-ати
 * результат у preview без додаткової конвертації.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true, title: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Порожній текст" }, { status: 400 });
  }
  if (text.length > 30000) {
    return NextResponse.json(
      { error: "Текст задовгий (макс 30 000 символів)" },
      { status: 400 },
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key не налаштовано" },
      { status: 500 },
    );
  }

  const systemPrompt = `Ти парсиш дані будівельного кошторису, скопійовані користувачем з Excel або Google Sheets, у дерево стейджів проєкту.

Структура дерева:
  Розділ (section, top-level) — заголовок без числових даних, наприклад:
    «Промислова підлога», «Оздоблення стін коридорів», «RD_01 Навроцького ЖК»
  Підетап (item) — конкретна робота з обсягом і ціною, наприклад:
    «Монтаж опалубки», «Шліфування стін»

Кожна нода має поля:
  • tempId           — унікальний рядок ("n1", "n2", …)
  • parentTempId     — tempId розділу-батька, або null для top-level
  • customName       — назва без зайвих суфіксів
  • isSection        — true для розділу (без обсягу/ціни), false для підетапу
  • unit             — одиниця виміру: "шт","м","м²","м³","кг","т","л","пог.м","м.п.","год", або null
  • planVolume       — number або null, обсяг роботи
  • planUnitPrice    — number або null, СОБІВАРТІСНА вартість за одиницю (наша)
  • planClientUnitPrice — number або null, ВАРТІСТЬ ДЛЯ ЗАМОВНИКА за одиницю (з націнкою)
  • responsibleHint  — імʼя відповідального з рядка, або null (наприклад "Юрій", "Олександр")
  • sourceLine       — номер рядка в paste (1-based)

Правила:
  1. Числа в українському форматі: "10 000 ₴", "1 000,50", "364 500 ₴" — нормалізуй до number.
  2. Якщо в рядку 2 числа → planVolume + planUnitPrice. Якщо 3 → ще planClientUnitPrice. Якщо 1 → planVolume.
  3. Header-рядок з лейблами ("Назва", "Об'єм", "Вартість", "Од.виміру") пропускай.
  4. Підетап завжди прив'язаний до останнього оголошеного розділу (parentTempId = tempId цього розділу).
  5. Якщо рядок порожній або не зрозумілий — пропускай.
  6. Зберігай той же порядок, що в paste.
  7. Назви проєкту-обгортки на кшталт "RD_01 Навроцького ЖК" — це теж розділ верхнього рівня, всі наступні підрозділи будуть його дітьми. Глибина обмежена 3 рівнями (Проєкт → Розділ → Підетап).

Відповідай ТІЛЬКИ JSON виду:
{
  "nodes": [
    { "tempId": "n1", "parentTempId": null, "customName": "Промислова підлога", "isSection": true, "unit": null, "planVolume": null, "planUnitPrice": null, "planClientUnitPrice": null, "responsibleHint": null, "sourceLine": 1 },
    { "tempId": "n2", "parentTempId": "n1", "customName": "Монтаж опалубки", "isSection": false, "unit": "м.п.", "planVolume": 39, "planUnitPrice": 150, "planClientUnitPrice": null, "responsibleHint": "Юрій", "sourceLine": 2 }
  ]
}`;

  const userPrompt = `Контекст: проєкт «${project.title}».

Розпарси наступний paste у дерево стейджів:

\`\`\`
${text}
\`\`\``;

  let nodes: AiNode[] = [];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.nodes)) {
      throw new Error("AI повернув некоректну структуру (немає поля nodes)");
    }

    const seenIds = new Set<string>();
    nodes = parsed.nodes
      .map((n: unknown, idx: number): AiNode | null => {
        if (typeof n !== "object" || !n) return null;
        const node = n as Record<string, unknown>;
        const tempId =
          typeof node.tempId === "string" && node.tempId
            ? node.tempId
            : `n${idx + 1}`;
        if (seenIds.has(tempId)) return null;
        seenIds.add(tempId);
        const customName =
          typeof node.customName === "string" ? node.customName.trim() : "";
        if (!customName) return null;
        const num = (v: unknown) => {
          if (v === null || v === undefined || v === "") return null;
          const n = typeof v === "number" ? v : Number(v);
          return Number.isFinite(n) ? n : null;
        };
        return {
          tempId,
          parentTempId:
            typeof node.parentTempId === "string" && node.parentTempId
              ? node.parentTempId
              : null,
          customName: customName.slice(0, 200),
          isSection: Boolean(node.isSection),
          unit:
            typeof node.unit === "string" && node.unit.trim()
              ? node.unit.trim()
              : null,
          planVolume: num(node.planVolume),
          planUnitPrice: num(node.planUnitPrice),
          planClientUnitPrice: num(node.planClientUnitPrice),
          responsibleHint:
            typeof node.responsibleHint === "string" && node.responsibleHint.trim()
              ? node.responsibleHint.trim()
              : null,
          sourceLine:
            typeof node.sourceLine === "number" && Number.isFinite(node.sourceLine)
              ? node.sourceLine
              : idx + 1,
        };
      })
      .filter((n: AiNode | null): n is AiNode => n !== null);

    // Sanity: parentTempId має існувати в наборі — інакше null.
    const validIds = new Set(nodes.map((n) => n.tempId));
    nodes = nodes.map((n) =>
      n.parentTempId && !validIds.has(n.parentTempId)
        ? { ...n, parentTempId: null }
        : n,
    );
  } catch (err) {
    console.error("[ai-parse] OpenAI failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Помилка AI: ${err.message}`
            : "Помилка AI-розпізнавання",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      nodes,
      sectionCount: nodes.filter((n) => n.isSection).length,
      itemCount: nodes.filter((n) => !n.isSection).length,
    },
  });
}
