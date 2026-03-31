import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { exportMaterialsToExcel } from "@/lib/import/materials-import";

/**
 * GET /api/admin/materials/export
 * Експортувати всі матеріали в Excel
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Тільки адміністратори та менеджери
  if (!["SUPER_ADMIN", "MANAGER"].includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const materials = await prisma.material.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        name: true,
        sku: true,
        category: true,
        unit: true,
        basePrice: true,
        laborRate: true,
        markup: true,
        description: true,
        isActive: true,
      },
    });

    const materialsData = materials.map((m) => ({
      ...m,
      basePrice: Number(m.basePrice),
      laborRate: Number(m.laborRate),
      markup: Number(m.markup),
    }));

    const buffer = await exportMaterialsToExcel(materialsData);

    const date = new Date().toISOString().split("T")[0];
    const filename = `Матеріали_${date}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error("Error exporting materials:", error);
    return NextResponse.json({ error: error.message || "Помилка експорту" }, { status: 500 });
  }
}
