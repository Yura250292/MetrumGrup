import { NextRequest, NextResponse } from "next/server";
import type { Prisma, Role, ReceiptScanStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

const STATUS_VALUES: ReceiptScanStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const projectId = url.searchParams.get("projectId");
  const mine = url.searchParams.get("mine") === "1";
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "50", 10) || 50, 200);

  const where: Prisma.ReceiptScanWhereInput = {};
  if (statusParam && STATUS_VALUES.includes(statusParam as ReceiptScanStatus)) {
    where.status = statusParam as ReceiptScanStatus;
  }
  if (projectId) where.projectId = projectId;
  if (mine) where.createdById = session.user.id;

  const scans = await prisma.receiptScan.findMany({
    where,
    take,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      _count: { select: { lineItems: true } },
    },
  });

  return NextResponse.json({ data: scans });
}
