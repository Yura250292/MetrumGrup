import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") return forbiddenResponse();

  const workers = await prisma.worker.findMany({
    include: {
      crewAssignments: {
        where: { endDate: null },
        include: { project: { select: { title: true } } },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: workers });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") return forbiddenResponse();

  const body = await request.json();
  const worker = await prisma.worker.create({ data: body });
  return NextResponse.json({ data: worker }, { status: 201 });
}
