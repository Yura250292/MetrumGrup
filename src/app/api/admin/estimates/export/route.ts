import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  generateEstimateV2Excel,
  generateEstimateV2PDF,
  type EstimateV2Data,
} from "@/lib/export/estimate-v2-export";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  try {
    const { format, estimate } = (await request.json()) as {
      format: "pdf" | "excel";
      estimate: EstimateV2Data;
    };

    const totalItems = (estimate?.sections || []).reduce(
      (sum, s) => sum + (s.items?.length || 0),
      0
    );
    console.log(`📤 Export ${format}: ${estimate?.sections?.length || 0} sections, ${totalItems} items`);

    if (!estimate || !Array.isArray(estimate.sections) || estimate.sections.length === 0) {
      return NextResponse.json(
        { error: "Немає даних для експорту", message: "estimate.sections is empty" },
        { status: 400 }
      );
    }

    if (format === "excel") {
      const buffer = await generateEstimateV2Excel(estimate);
      console.log(`✅ Excel згенеровано: ${Math.round(buffer.byteLength / 1024)} KB`);
      return new NextResponse(buffer as any, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="koshtorys-${Date.now()}.xlsx"`,
          "Content-Length": String(buffer.byteLength),
        },
      });
    }

    if (format === "pdf") {
      const buffer = await generateEstimateV2PDF(estimate);
      console.log(`✅ PDF згенеровано: ${Math.round(buffer.byteLength / 1024)} KB`);
      return new NextResponse(buffer as any, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="koshtorys-metrum-${Date.now()}.pdf"`,
          "Content-Length": String(buffer.byteLength),
        },
      });
    }

    return NextResponse.json({ error: "Невідомий формат" }, { status: 400 });
  } catch (error) {
    console.error("❌ Export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : "";
    console.error("Stack:", stack);
    return NextResponse.json(
      {
        error: "Failed to export",
        message,
        stack: stack?.split("\n").slice(0, 5).join("\n"),
      },
      { status: 500 }
    );
  }
}
