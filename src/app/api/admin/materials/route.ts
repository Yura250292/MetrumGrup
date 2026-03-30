import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const materials = await prisma.material.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ data: materials });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const { name, sku, category, unit, basePrice, laborRate, markup, description } = body;

  const existing = await prisma.material.findUnique({ where: { sku } });
  if (existing) {
    return NextResponse.json({ error: "SKU вже існує" }, { status: 400 });
  }

  const material = await prisma.material.create({
    data: {
      name,
      sku,
      category,
      unit,
      basePrice,
      laborRate: laborRate || 0,
      markup: markup || 0,
      description: description || null,
    },
  });

  return NextResponse.json({ data: material }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const { id, ...updateData } = body;

  const material = await prisma.material.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ data: material });
}
