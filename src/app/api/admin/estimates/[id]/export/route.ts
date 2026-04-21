import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  generateEstimateV2Excel,
  generateEstimateV2PDF,
  type EstimateV2Data,
  type EstimateV2Section,
  type EstimateV2Item,
} from "@/lib/export/estimate-v2-export";

export const runtime = "nodejs";
export const maxDuration = 60;

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "pdf" ? "pdf" : "excel";

  try {
    const estimate = await prisma.estimate.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } },
        project: { select: { id: true, title: true } },
      },
    });

    if (!estimate) {
      return NextResponse.json({ error: "Кошторис не знайдено" }, { status: 404 });
    }

    // Build sections. If the estimate has explicit sections, use them.
    // Otherwise, group items by their `category` (from AI parsing) or put them all in one.
    let sections: EstimateV2Section[] = [];

    if (estimate.sections.length > 0) {
      sections = estimate.sections.map((sec) => ({
        title: sec.title,
        items: sec.items.map((it) => serializeItem(it)),
        sectionTotal: sec.items.reduce((s, it) => s + Number(it.amount ?? 0), 0),
      }));
    } else {
      // Group flat items by category
      const groups = new Map<string, typeof estimate.items>();
      for (const it of estimate.items) {
        const key = "Позиції";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(it);
      }
      for (const [title, items] of groups) {
        sections.push({
          title,
          items: items.map((it) => serializeItem(it)),
          sectionTotal: items.reduce((s, it) => s + Number(it.amount ?? 0), 0),
        });
      }
    }

    const data: EstimateV2Data = {
      title: `${estimate.title}${estimate.project ? ` — ${estimate.project.title}` : ""}`,
      description: estimate.description ?? undefined,
      sections,
      summary: {
        totalBeforeDiscount: Number(estimate.totalAmount),
      },
    };

    const safeName = sanitizeFileName(
      `${estimate.role.toLowerCase()}-${estimate.project?.title ?? "estimate"}-${estimate.version ?? 1}`,
    );

    if (format === "excel") {
      const buffer = await generateEstimateV2Excel(data);
      return new NextResponse(buffer as any, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
          "Content-Length": String(buffer.byteLength),
        },
      });
    }

    const buffer = await generateEstimateV2PDF(data);
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (error) {
    console.error("[estimates/[id]/export] error:", error);
    const msg = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function serializeItem(it: {
  description: string;
  unit: string;
  quantity: any;
  unitPrice: any;
  amount: any;
  laborRate?: any;
  laborHours?: any;
}): EstimateV2Item {
  const laborCost = Number(it.laborRate ?? 0) * Number(it.laborHours ?? 0);
  return {
    description: it.description,
    unit: it.unit,
    quantity: Number(it.quantity),
    unitPrice: Number(it.unitPrice),
    laborCost,
    totalCost: Number(it.amount ?? 0),
  };
}

function sanitizeFileName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9а-яА-ЯіІїЇєЄґҐ_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
