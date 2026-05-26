import { NextRequest, NextResponse } from "next/server";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  let firmId: string | null;
  try {
    ({ firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  const { id } = await params;

  const tpl = await prisma.formTemplate.findFirst({
    where: { id, isActive: true, firmId: firmId ?? undefined },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      version: true,
      schema: true,
    },
  });
  if (!tpl) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  return NextResponse.json({ data: tpl });
}
