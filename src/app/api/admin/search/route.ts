import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { PROJECT_NOT_TEST } from "@/lib/projects/filters";

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

  const [projects, clients, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { title: insensitive, ...PROJECT_NOT_TEST },
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
      where: { role: "CLIENT", OR: [{ name: insensitive }, { email: insensitive }] },
      select: { id: true, name: true, email: true },
      take: 5,
    }),
    prisma.task.findMany({
      where: { isArchived: false, title: insensitive },
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
