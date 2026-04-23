import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  parseCounterpartiesExcel,
  readSheetAsRows,
  applyCounterpartyMapping,
  COUNTERPARTY_FIELDS,
  type ImportResult,
  type CounterpartyImportRow,
} from "@/lib/import/hr-import";
import { inferColumnMapping } from "@/lib/import/ai-mapper";

async function parseWithAi(buffer: Buffer): Promise<ImportResult<CounterpartyImportRow>> {
  const rows = await readSheetAsRows(buffer);
  const mapping = await inferColumnMapping(rows, COUNTERPARTY_FIELDS);
  return applyCounterpartyMapping(rows, mapping.headerRow, mapping.columnMap);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Підтримуються тільки Excel файли (.xlsx, .xls)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed: ImportResult<CounterpartyImportRow>;
    let usedAi = false;
    try {
      parsed = await parseCounterpartiesExcel(buffer);
      if (parsed.validRows === 0) {
        parsed = await parseWithAi(buffer);
        usedAi = true;
      }
    } catch {
      parsed = await parseWithAi(buffer);
      usedAi = true;
    }

    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "validate") {
      return NextResponse.json({ preview: parsed, usedAi });
    }

    const result = await prisma.counterparty.createMany({ data: parsed.data });

    return NextResponse.json({
      created: result.count,
      totalRows: parsed.totalRows,
      errors: parsed.errors,
      usedAi,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Помилка імпорту";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
