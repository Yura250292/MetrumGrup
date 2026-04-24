import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

type FolderCard = {
  id: string;
  name: string;
  color: string | null;
  updatedAt: string;
  income: number;
  expense: number;
  balance: number;
  entryCount: number;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const folders = await prisma.folder.findMany({
    where: { domain: "FINANCE" },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: {
      id: true,
      name: true,
      color: true,
      updatedAt: true,
    },
  });

  if (folders.length === 0) {
    return NextResponse.json({ data: { items: [] } });
  }

  const ids = folders.map((f) => f.id);
  const grouped = await prisma.financeEntry.groupBy({
    by: ["folderId", "type"],
    where: {
      folderId: { in: ids },
      kind: "FACT",
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const byFolder = new Map<string, { income: number; expense: number; count: number }>();
  for (const g of grouped) {
    if (!g.folderId) continue;
    const cur = byFolder.get(g.folderId) ?? { income: 0, expense: 0, count: 0 };
    const sum = Number(g._sum.amount ?? 0);
    if (g.type === "INCOME") cur.income += sum;
    else if (g.type === "EXPENSE") cur.expense += sum;
    cur.count += g._count._all;
    byFolder.set(g.folderId, cur);
  }

  const items: FolderCard[] = folders
    .map((f) => {
      const agg = byFolder.get(f.id) ?? { income: 0, expense: 0, count: 0 };
      return {
        id: f.id,
        name: f.name,
        color: f.color,
        updatedAt: f.updatedAt.toISOString(),
        income: agg.income,
        expense: agg.expense,
        balance: agg.income - agg.expense,
        entryCount: agg.count,
      };
    })
    // Only return folders with at least one entry OR recently touched
    .filter((f) => f.entryCount > 0 || Date.now() - new Date(f.updatedAt).getTime() < 30 * 24 * 60 * 60 * 1000)
    .slice(0, 6);

  return NextResponse.json({ data: { items } });
}
