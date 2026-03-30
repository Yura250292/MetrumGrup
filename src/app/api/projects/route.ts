import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scopeByClient, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const scope = scopeByClient(session);

  const projects = await prisma.project.findMany({
    where: scope,
    include: {
      stages: { orderBy: { sortOrder: "asc" } },
      client: { select: { id: true, name: true, email: true, phone: true } },
      manager: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: projects });
}
