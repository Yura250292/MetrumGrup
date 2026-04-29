import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export const runtime = "nodejs";

/**
 * Шукає FINANCE-папки у дереві активної фірми, які НЕ привʼязані до жодного
 * проекту/папки і мають назву близьку до запитаної. Використовується формою
 * створення проекту, щоб запропонувати обʼєднати з існуючою папкою фінансів.
 *
 * Повертає до 5 кандидатів, відсортованих за суворістю збігу:
 *   exact match → starts-with → contains.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER") {
    return forbiddenResponse();
  }

  const title = request.nextUrl.searchParams.get("title")?.trim() ?? "";
  if (title.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const candidates = await prisma.folder.findMany({
    where: {
      domain: "FINANCE",
      mirroredFromId: null,
      mirroredFromProjectId: null,
      ...(firmId ? { firmId } : {}),
      name: { contains: title, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      _count: { select: { financeEntries: true } },
    },
    take: 5,
  });

  // Сортуємо: exact (case-insensitive) > starts-with > contains.
  const lower = title.toLowerCase();
  const ranked = candidates
    .map((c) => {
      const n = c.name.toLowerCase();
      const score = n === lower ? 3 : n.startsWith(lower) ? 2 : 1;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({
    data: ranked.map((c) => ({
      id: c.id,
      name: c.name,
      entryCount: c._count.financeEntries,
    })),
  });
}
