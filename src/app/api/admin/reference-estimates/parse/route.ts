import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse, ESTIMATE_ROLES } from "@/lib/auth-utils";
import { parseReferenceEstimateBuffer } from "@/lib/benchmark/reference-parser";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ESTIMATE_ROLES.includes(session.user.role as any)) {
    return forbiddenResponse();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Очікується multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл відсутній" }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    return NextResponse.json(
      {
        error:
          "PDF шаблони поки не підтримуються. Завантажте XLSX або використайте 'AI з файлів' для конвертації.",
      },
      { status: 400 }
    );
  }
  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    return NextResponse.json(
      { error: "Підтримуються лише файли .xlsx або .xls" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Файл занадто великий (макс. 10 МБ)" },
      { status: 400 }
    );
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseReferenceEstimateBuffer(buffer, file.name);

    const sections = parsed.sections.map((section, sIdx) => ({
      title: section.title,
      sortOrder: sIdx,
      sectionTotal: section.sectionTotal,
      items: section.items.map((item, iIdx) => ({
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalCost: item.totalCost,
        kind: item.kind,
        sortOrder: iIdx,
      })),
    }));

    return NextResponse.json({
      data: {
        fileName: file.name,
        format: parsed.format,
        sections,
        grandTotal: parsed.totals.grandTotal,
        itemCount: parsed.itemCount,
      },
    });
  } catch (error: any) {
    console.error("Error parsing reference XLSX:", error);
    return NextResponse.json(
      { error: error?.message || "Не вдалося розпарсити файл" },
      { status: 422 }
    );
  }
}
