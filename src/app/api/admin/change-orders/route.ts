import { NextRequest, NextResponse } from "next/server";
import { Prisma, type ChangeOrderStatus, type ChangeOrderType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { canCreateCO, maskCostImpact } from "@/lib/change-orders/access";
import {
  peekNextCONumber,
  withRetryOnUniqueViolation,
} from "@/lib/change-orders/numbering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<ChangeOrderStatus>([
  "DRAFT",
  "PENDING_PM",
  "PENDING_ADMIN",
  "PENDING_CLIENT",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);
const VALID_TYPES = new Set<ChangeOrderType>(["ADD", "REMOVE", "SWAP"]);

type ItemInput = {
  costCodeId: string;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
  sign: 1 | -1;
  sortOrder?: number;
};

type CreateBody = {
  projectId: string;
  type: ChangeOrderType;
  title: string;
  description: string;
  reasonFromClient?: string | null;
  scheduleImpactDays?: number;
  items: ItemInput[];
  aiSourceChatId?: string | null;
  aiConfidence?: number | null;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && VALID_STATUSES.has(statusParam as ChangeOrderStatus)
      ? (statusParam as ChangeOrderStatus)
      : undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(
    Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    500,
  );

  const requestedAt: Prisma.DateTimeFilter | undefined =
    from || to
      ? {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        }
      : undefined;

  const orders = await prisma.changeOrder.findMany({
    where: {
      firmId: firmId ?? undefined,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(requestedAt ? { requestedAt } : {}),
    },
    include: {
      project: { select: { id: true, title: true } },
      requestedBy: { select: { id: true, name: true } },
      _count: { select: { items: true, attachments: true } },
    },
    orderBy: { requestedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    orders: orders.map((co) =>
      maskCostImpact(
        {
          id: co.id,
          number: co.number,
          project: co.project,
          type: co.type,
          status: co.status,
          title: co.title,
          requestedAt: co.requestedAt,
          requestedBy: co.requestedBy,
          costImpact: Number(co.costImpact),
          scheduleImpactDays: co.scheduleImpactDays,
          itemCount: co._count.items,
          attachmentCount: co._count.attachments,
        },
        role,
      ),
    ),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !canCreateCO(role) || !firmId) return forbiddenResponse();

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return badRequest("invalid-json");
  }

  if (!body.projectId) return badRequest("projectId-required");
  if (!body.type || !VALID_TYPES.has(body.type)) return badRequest("type-invalid");
  if (!body.title?.trim()) return badRequest("title-required");
  if (!body.description?.trim()) return badRequest("description-required");
  if (!Array.isArray(body.items) || body.items.length === 0)
    return badRequest("items-required");
  for (const it of body.items) {
    if (!it.costCodeId) return badRequest("item.costCodeId-required");
    if (it.qty == null || it.unitPrice == null)
      return badRequest("item.qty/unitPrice-required");
    if (it.sign !== 1 && it.sign !== -1) return badRequest("item.sign-invalid");
  }

  // Verify project belongs to active firm.
  const project = await prisma.project.findFirst({
    where: { id: body.projectId, firmId },
    select: { id: true },
  });
  if (!project) return forbiddenResponse();

  const costImpact = body.items.reduce(
    (sum, it) =>
      sum + (it.sign === 1 ? 1 : -1) * Number(it.qty) * Number(it.unitPrice),
    0,
  );

  const created = await withRetryOnUniqueViolation(async () =>
    prisma.$transaction(async (tx) => {
      const number = await peekNextCONumber(tx, firmId);
      return tx.changeOrder.create({
        data: {
          firmId,
          projectId: body.projectId,
          number,
          type: body.type,
          title: body.title.trim(),
          description: body.description.trim(),
          reasonFromClient: body.reasonFromClient?.trim() || null,
          costImpact: new Prisma.Decimal(costImpact.toFixed(2)),
          scheduleImpactDays: body.scheduleImpactDays ?? 0,
          requestedById: session.user.id,
          aiGenerated: Boolean(body.aiSourceChatId),
          aiSourceChatId: body.aiSourceChatId ?? null,
          aiConfidence: body.aiConfidence ?? null,
          items: {
            create: body.items.map((it, idx) => ({
              costCodeId: it.costCodeId,
              description: it.description,
              unit: it.unit,
              qty: new Prisma.Decimal(it.qty),
              unitPrice: new Prisma.Decimal(it.unitPrice),
              totalPrice: new Prisma.Decimal(
                (it.sign === 1 ? 1 : -1) * Number(it.qty) * Number(it.unitPrice),
              ),
              sign: it.sign,
              sortOrder: it.sortOrder ?? idx,
            })),
          },
        },
        select: { id: true, number: true },
      });
    }),
  );

  return NextResponse.json({ id: created.id, number: created.number }, { status: 201 });
}
