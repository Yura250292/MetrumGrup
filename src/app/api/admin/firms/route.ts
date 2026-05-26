import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Lightweight list of firms visible to the current session.
/// SUPER_ADMIN sees all firms; everyone else sees only their home firm.
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const isSuper = session.user.role === "SUPER_ADMIN";
  const firms = await prisma.firm.findMany({
    where: isSuper ? {} : { id: session.user.firmId ?? "__none__" },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ firms });
}
