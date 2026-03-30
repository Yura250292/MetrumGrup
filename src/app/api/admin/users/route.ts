import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const roleParam = request.nextUrl.searchParams.get("role");
  const roles = roleParam ? roleParam.split(",") : undefined;

  const users = await prisma.user.findMany({
    where: roles ? { role: { in: roles as any[] } } : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          createdEstimates: true,
          engineerReviews: true,
          financeReviews: true,
          clientProjects: true,
        },
      },
    },
    orderBy: [
      { role: "asc" },
      { name: "asc" },
    ],
  });

  return NextResponse.json({ data: users });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN") return forbiddenResponse();

  const body = await request.json();
  const { name, email, password, phone, role } = body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Користувач з таким email вже існує" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password || "password123", 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      phone: phone || null,
      role: role || "CLIENT",
    },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ data: user }, { status: 201 });
}
