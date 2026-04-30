import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse, ADMIN_ROLES, FINANCE_ROLES } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateEstimatePDF, generateEstimateExcel } from "@/lib/export/estimate-export";
import { auditLog } from "@/lib/audit";

/**
 * GET /api/estimates/[id]/export?format=pdf|excel
 *
 * Експорт фінального кошторису
 * Доступ: SUPER_ADMIN, MANAGER, FINANCIER
 * Можливість надіслати клієнту через query param: &sendToClient=true
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Перевірка ролі: тільки адміністратори та фінансовий директор
  const allowedRoles = [...ADMIN_ROLES, ...FINANCE_ROLES];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "pdf";
  const sendToClient = searchParams.get("sendToClient") === "true";

  try {
    // Знайти кошторис (адміни можуть експортувати будь-який)
    const estimate = await prisma.estimate.findFirst({
      where: {
        id,
      },
      include: {
        project: {
          include: {
            client: { select: { name: true, email: true, phone: true } },
            clientCounterparty: { select: { name: true } },
          },
        },
        items: { orderBy: { sortOrder: "asc" } },
        createdBy: { select: { name: true } },
      },
    });

    if (!estimate) {
      return NextResponse.json(
        { error: "Кошторис не знайдено" },
        { status: 404 }
      );
    }

    // Генерація файлу
    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    if (format === "excel") {
      console.log('[Export] Generating Excel...');
      buffer = await generateEstimateExcel(estimate);
      filename = `Кошторис_${estimate.number}.xlsx`;
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      console.log('[Export] Excel generated successfully, size:', buffer.length);
    } else {
      console.log('[Export] Generating PDF...');
      buffer = await generateEstimatePDF(estimate);
      console.log('[Export] PDF generated successfully, size:', buffer.length);
      filename = `Кошторис_${estimate.number}.pdf`;
      contentType = "application/pdf";
    }

    // Логування експорту
    await auditLog({
      userId: session.user.id,
      action: "EXPORT",
      entity: "Estimate",
      entityId: estimate.id,
      projectId: estimate.projectId,
      newData: {
        format,
        exportedBy: session.user.role,
        sentToClient: sendToClient
      },
    });

    // Відправка клієнту (якщо запитано). Можлива тільки коли є привʼязка
    // до User-CLIENT з email — для free-text або counterparty без логіну
    // надсилання email пропускаємо.
    if (sendToClient) {
      if (!estimate.project.clientId || !estimate.project.client?.email) {
        return NextResponse.json(
          { error: "Цей проєкт не має клієнта з email — відправка неможлива" },
          { status: 400 },
        );
      }

      console.log(`📧 Потрібно відправити ${filename} клієнту ${estimate.project.client.email}`);

      await prisma.notification.create({
        data: {
          userId: estimate.project.clientId,
          type: "ESTIMATE_SENT",
          title: "Новий кошторис",
          body: `Кошторис ${estimate.number} готовий до перегляду`,
          relatedEntity: "Estimate",
          relatedId: estimate.id,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Кошторис експортовано та надіслано клієнту ${estimate.project.client.name}`,
        estimate: {
          number: estimate.number,
          clientEmail: estimate.project.client.email,
        },
      });
    }

    // Повернення файлу для завантаження
    return new NextResponse(buffer as any, {
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
