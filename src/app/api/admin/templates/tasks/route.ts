import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  const items = await prisma.taskTemplate.findMany({
    where: projectId
      ? { OR: [{ projectId }, { projectId: null }] }
      : { projectId: null },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!body.dataJson || typeof body.dataJson !== "object") {
    return NextResponse.json({ error: "dataJson required" }, { status: 400 });
  }

  const created = await prisma.taskTemplate.create({
    data: {
      name,
      description: body.description ? String(body.description) : null,
      projectId: body.projectId ? String(body.projectId) : null,
      dataJson: body.dataJson as object,
      createdById: session.user.id,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
