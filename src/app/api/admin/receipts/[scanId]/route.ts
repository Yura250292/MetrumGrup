import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { matchMaterial } from "@/lib/matching/material-matcher";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ scanId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { scanId } = await ctx.params;
  const scan = await prisma.receiptScan.findUnique({
    where: { id: scanId },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
      financeEntry: { select: { id: true, status: true } },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: {
          matchedMaterial: { select: { id: true, name: true, sku: true, unit: true, basePrice: true } },
        },
      },
    },
  });
  if (!scan) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  // Attach top-3 candidates for unmatched/suggested items
  const enrichedLineItems = await Promise.all(
    scan.lineItems.map(async (li) => {
      if (li.status === "MATCHED" || li.status === "CONFIRMED" || li.status === "CREATE_NEW" || li.status === "SKIPPED") {
        return { ...li, candidates: [] as Array<{ materialId: string; name: string; sku: string; score: number }> };
      }
      const candidates = await matchMaterial(li.rawName, { topN: 3 });
      return {
        ...li,
        candidates: candidates.map((c) => ({
          materialId: c.material.id,
          name: c.material.name,
          sku: c.material.sku,
          unit: c.material.unit,
          basePrice: c.material.basePrice,
          score: c.score,
        })),
      };
    }),
  );

  return NextResponse.json({ data: { ...scan, lineItems: enrichedLineItems } });
}
