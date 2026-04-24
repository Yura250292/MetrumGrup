import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  dashboardLayoutSchema,
  type DashboardLayout,
} from "@/app/admin-v2/_components/dashboard/layout-schema";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dashboardLayoutJson: true },
  });

  const parsed = safeParseLayout(user?.dashboardLayoutJson);
  return NextResponse.json({ data: parsed });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const result = dashboardLayoutSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Невалідна розкладка", details: result.error.flatten() },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { dashboardLayoutJson: result.data as unknown as object },
  });

  return NextResponse.json({ data: result.data });
}

function safeParseLayout(raw: unknown): DashboardLayout | null {
  if (!raw) return null;
  const result = dashboardLayoutSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// Keep bundle lean; no edge runtime needed — Prisma is node-only here.
export const dynamic = "force-dynamic";
