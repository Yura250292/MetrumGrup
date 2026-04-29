import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { PROJECT_NOT_TEST } from "@/lib/projects/filters";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { firmWhereForProject } from "@/lib/firm/scope";

/**
 * Unified search across projects, clients, tasks. Returns up to 5 of each.
 * Fast (3 parallel prisma queries), case-insensitive `contains` match.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ projects: [], clients: [], tasks: [] });
  }

  const insensitive = { contains: q, mode: "insensitive" as const };

  // Глобальний пошук теж firm-scoped, інакше studio директор знайде Group проекти.
  const { firmId } = await resolveFirmScopeForRequest(session);
  const firmFilter = firmWhereForProject(firmId);

  const [projects, clients, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { title: insensitive, ...PROJECT_NOT_TEST, ...firmFilter },
      select: {
        id: true,
        title: true,
        currentStage: true,
        client: { select: { name: true } },
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({
      where: {
        role: "CLIENT",
        OR: [{ name: insensitive }, { email: insensitive }],
        ...(firmId ? { firmId } : {}),
      },
      select: { id: true, name: true, email: true },
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        isArchived: false,
        title: insensitive,
        ...(firmId ? { project: { firmId } } : {}),
      },
      select: {
        id: true,
        title: true,
        project: { select: { id: true, title: true } },
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return NextResponse.json({ projects, clients, tasks });
}
