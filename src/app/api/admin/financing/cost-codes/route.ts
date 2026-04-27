import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

/**
 * Returns the full active cost-code tree as a flat list with `depth`.
 * Frontend renders it indented in a single dropdown — fast, simple,
 * matches the small (~30–60 nodes) tree we maintain.
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const all = await prisma.costCode.findMany({
    where: { isActive: true },
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      parentId: true,
      defaultCostType: true,
      sortOrder: true,
    },
  });

  // Compute depth (root = 0) by walking parent links in-memory.
  const byId = new Map(all.map((n) => [n.id, n]));
  function depth(node: (typeof all)[number]): number {
    let d = 0;
    let cur = node.parentId ? byId.get(node.parentId) : null;
    while (cur) {
      d += 1;
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return d;
  }

  // Sort: root order first, then by code (which already encodes hierarchy).
  const data = all
    .map((n) => ({ ...n, depth: depth(n) }))
    .sort((a, b) => a.code.localeCompare(b.code, "uk"));

  return NextResponse.json({ data });
}
