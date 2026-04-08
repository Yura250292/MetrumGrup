/**
 * API для завантаження файлів в R2
 * POST /api/upload
 *
 * Використовується для доповнення кошторисів та інших операцій
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { uploadFilesToR2 } from "@/lib/r2-client";

export const maxDuration = 300;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Не надано файлів" },
        { status: 400 }
      );
    }

    console.log(`📤 Завантаження ${files.length} файлів в R2...`);

    // Завантажити файли в R2
    const uploadedFiles = await uploadFilesToR2(files);

    // Повернути R2 keys для подальшого використання
    const r2Keys = uploadedFiles.map(file => ({
      key: file.key,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size
    }));

    console.log(`✅ Завантажено ${r2Keys.length} файлів`);

    return NextResponse.json({
      success: true,
      r2Keys,
      count: r2Keys.length
    });

  } catch (error) {
    console.error("Помилка завантаження файлів:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Помилка завантаження" },
      { status: 500 }
    );
  }
}
