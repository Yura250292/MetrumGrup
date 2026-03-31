import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateEstimatePDF, generateEstimateExcel } from "@/lib/export/estimate-export";

/**
 * GET /api/estimates/[id]/export?format=pdf|excel
 *
 * Експорт кошторису для клієнта (тільки APPROVED статус)
 * Доступ: CLIENT (власник проєкту)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "pdf";

  try {
    // Знайти кошторис з перевіркою доступу
    const estimate = await prisma.estimate.findFirst({
      where: {
        id,
        status: "APPROVED", // Тільки затверджені кошториси
        project: {
          clientId: session.user.id, // Тільки власник проєкту
        },
      },
      include: {
        project: {
          include: {
            client: { select: { name: true, email: true, phone: true } },
          },
        },
        items: { orderBy: { sortOrder: "asc" } },
        createdBy: { select: { name: true } },
      },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Кошторис не знайдено або не затверджений" },
        { status: 404 }
      );
    }

    // Генерація файлу
    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    if (format === "excel") {
      buffer = await generateEstimateExcel(estimate);
      filename = `Кошторис_${estimate.number}.xlsx`;
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      buffer = await generateEstimatePDF(estimate);
      filename = `Кошторис_${estimate.number}.pdf`;
      contentType = "application/pdf";
    }

    // Повернення файлу
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error("Error exporting estimate:", error);
    return NextResponse.json(
      { error: error.message || "Помилка експорту" },
      { status: 500 }
    );
  }
}
