import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffAccess();
    const { id } = await ctx.params;

    const estimates = await prisma.estimate.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        totalAmount: true,
        finalClientPrice: true,
        createdAt: true,
        updatedAt: true,
        approvedAt: true,
      },
    });

    return NextResponse.json({ estimates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[projects/estimates] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
