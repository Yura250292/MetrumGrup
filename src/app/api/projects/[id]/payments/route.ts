import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Verify ownership for clients
  if (session.user.role === "CLIENT") {
    const project = await prisma.project.findFirst({
      where: { id, clientId: session.user.id },
      select: { id: true },
    });
    if (!project) return forbiddenResponse();
  }

  const payments = await prisma.payment.findMany({
    where: { projectId: id },
    orderBy: { scheduledDate: "asc" },
  });

  const totals = payments.reduce(
    (acc, p) => ({
      total: acc.total + Number(p.amount),
      paid: acc.paid + (p.status === "PAID" ? Number(p.amount) : 0),
    }),
    { total: 0, paid: 0 }
  );

  return NextResponse.json({
    data: payments,
    totals: {
      ...totals,
      remaining: totals.total - totals.paid,
    },
  });
}
