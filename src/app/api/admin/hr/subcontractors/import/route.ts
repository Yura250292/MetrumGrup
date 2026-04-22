import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { parseSubcontractorsExcel } from "@/lib/import/hr-import";

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
    const parsed = await parseSubcontractorsExcel(buffer);

    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "validate") {
      return NextResponse.json({ preview: parsed });
    }

    // For Worker, keep dailyRate synced when rateType is PER_DAY (backwards compat)
    const data = parsed.data.map((row) => ({
      ...row,
      dailyRate: row.rateType === "PER_DAY" ? row.rateAmount : null,
    }));

    const result = await prisma.worker.createMany({ data });

    return NextResponse.json({
      created: result.count,
      totalRows: parsed.totalRows,
      errors: parsed.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Помилка імпорту";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
