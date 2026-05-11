import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { parseInvoicesExcel } from "@/lib/financing/invoice-import/parse-excel";
import {
  buildPlan,
  type CounterpartyCandidate,
} from "@/lib/financing/invoice-import/build-plan";
import type { ProjectCandidate } from "@/lib/financing/invoice-import/match-project";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

/**
 * Preview-етап імпорту рахунків з xlsx (формат кошторисниці).
 * Парсить файл, кластеризує постачальників, матчить на existing Counterparty
 * у ОБОХ фірмах і на Project у Group. Не пише в БД — UI потім посилає
 * відредагований plan на /commit.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  let file: File | null = null;
  try {
    const formData = await request.formData();
    file = formData.get("file") as File | null;
  } catch (e) {
    return NextResponse.json(
      { error: "Не вдалось прочитати multipart payload" },
      { status: 400 },
    );
  }
  if (!file) {
    return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });
  }
  if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
    return NextResponse.json(
      { error: "Підтримуються тільки .xlsx/.xls" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseInvoicesExcel(buffer);
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "У файлі не знайдено рядків даних" },
      { status: 400 },
    );
  }

  const [cpGroup, cpStudio, projGroup, projStudio] = await Promise.all([
    prisma.counterparty.findMany({
      where: { firmId: "metrum-group", isActive: true },
      select: { id: true, name: true, firmId: true, edrpou: true, taxId: true },
    }),
    prisma.counterparty.findMany({
      where: { firmId: "metrum-studio", isActive: true },
      select: { id: true, name: true, firmId: true, edrpou: true, taxId: true },
    }),
    prisma.project.findMany({
      where: { firmId: "metrum-group" },
      select: { id: true, title: true, slug: true, address: true },
    }),
    prisma.project.findMany({
      where: { firmId: "metrum-studio" },
      select: { id: true, title: true, slug: true, address: true },
    }),
  ]);

  const plan = buildPlan({
    rows: parsed.rows,
    counterpartiesGroup: cpGroup as CounterpartyCandidate[],
    counterpartiesStudio: cpStudio as CounterpartyCandidate[],
    projectsByFirm: {
      group: projGroup as ProjectCandidate[],
      studio: projStudio as ProjectCandidate[],
    },
  });

  return NextResponse.json({
    plan,
    parsedRows: parsed.rows.length,
    skippedRows: parsed.skippedRows,
  });
}
