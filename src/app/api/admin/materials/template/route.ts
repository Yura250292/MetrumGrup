import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { generateMaterialsTemplate } from "@/lib/import/materials-import";

/**
 * GET /api/admin/materials/template
 * Завантажити шаблон Excel для імпорту матеріалів
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Тільки адміністратори та менеджери
  if (!["SUPER_ADMIN", "MANAGER"].includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const buffer = await generateMaterialsTemplate();

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Шаблон_Матеріали.xlsx"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error("Error generating template:", error);
    return NextResponse.json({ error: error.message || "Помилка генерації шаблону" }, { status: 500 });
  }
}
