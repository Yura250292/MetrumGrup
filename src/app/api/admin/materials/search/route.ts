import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { matchMaterial } from "@/lib/matching/material-matcher";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const topN = Math.min(parseInt(url.searchParams.get("topN") ?? "10", 10) || 10, 30);

  if (!q.trim()) return NextResponse.json({ data: [] });

  const results = await matchMaterial(q, { topN });
  return NextResponse.json({
    data: results.map((c) => ({
      materialId: c.material.id,
      name: c.material.name,
      sku: c.material.sku,
      unit: c.material.unit,
      category: c.material.category,
      basePrice: c.material.basePrice,
      score: c.score,
    })),
  });
}
