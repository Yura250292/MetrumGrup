import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { parseCounterpartiesExcel } from "@/lib/import/hr-import";

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
    const parsed = await parseCounterpartiesExcel(buffer);

    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "validate") {
      return NextResponse.json({ preview: parsed });
    }

    const result = await prisma.counterparty.createMany({ data: parsed.data });

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
