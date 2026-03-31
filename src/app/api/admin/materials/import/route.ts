import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { parseMaterialsExcel } from "@/lib/import/materials-import";

/**
 * POST /api/admin/materials/import
 * Імпортувати матеріали з Excel файлу
 *
 * Body: multipart/form-data з полем "file"
 * Query params:
 *   - mode: "validate" (тільки валідація) або "import" (імпорт з перезаписом дублікатів)
 *   - skipDuplicates: "true" (пропустити дублікати) або "false" (оновити дублікати)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Тільки адміністратори та менеджери
  if (!["SUPER_ADMIN", "MANAGER"].includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });
    }

    // Перевірка типу файлу
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Підтримуються тільки Excel файли (.xlsx, .xls)" },
        { status: 400 }
      );
    }

    // Конвертуємо File в Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Парсимо Excel
    const result = await parseMaterialsExcel(buffer);

    // Якщо режим тільки валідації
    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "validate") {
      return NextResponse.json({
        success: true,
        data: result.data,
        errors: result.errors,
        totalRows: result.totalRows,
        validRows: result.validRows,
        invalidRows: result.errors.length,
      });
    }

    // Імпорт даних
    if (result.validRows === 0) {
      return NextResponse.json(
        { error: "Немає валідних рядків для імпорту", errors: result.errors },
        { status: 400 }
      );
    }

    const skipDuplicates = request.nextUrl.searchParams.get("skipDuplicates") === "true";

    // Перевіряємо дублікати по SKU
    const existingSkus = await prisma.material.findMany({
      where: {
        sku: { in: result.data.map((m) => m.sku) },
      },
      select: { sku: true, id: true },
    });

    const existingSkuSet = new Set(existingSkus.map((m) => m.sku));
    const skuToIdMap = new Map(existingSkus.map((m) => [m.sku, m.id]));

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // Імпортуємо або оновлюємо матеріали
    for (const material of result.data) {
      const isDuplicate = existingSkuSet.has(material.sku);

      if (isDuplicate) {
        if (skipDuplicates) {
          skippedCount++;
          continue;
        }

        // Оновлюємо існуючий матеріал
        const materialId = skuToIdMap.get(material.sku);
        await prisma.material.update({
          where: { id: materialId },
          data: {
            name: material.name,
            category: material.category,
            unit: material.unit,
            basePrice: material.basePrice,
            laborRate: material.laborRate,
            markup: material.markup,
            description: material.description || null,
          },
        });
        updatedCount++;
      } else {
        // Створюємо новий матеріал
        await prisma.material.create({
          data: {
            name: material.name,
            sku: material.sku,
            category: material.category,
            unit: material.unit,
            basePrice: material.basePrice,
            laborRate: material.laborRate || 0,
            markup: material.markup || 0,
            description: material.description || null,
            isActive: true,
          },
        });
        createdCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Імпорт завершено успішно",
      stats: {
        total: result.totalRows,
        valid: result.validRows,
        invalid: result.errors.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
      },
      errors: result.errors,
    });
  } catch (error: any) {
    console.error("Error importing materials:", error);
    return NextResponse.json(
      { error: error.message || "Помилка імпорту матеріалів" },
      { status: 500 }
    );
  }
}
