import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { syncEstimateToFinancing } from "@/lib/financing/sync-from-estimate";

export const runtime = "nodejs";
export const maxDuration = 120;

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

type ParsedItemInput = {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category?: string | null;
};

type SideInput = {
  title?: string;
  items: ParsedItemInput[];
  totalAmount: number;
  fileR2Key?: string;
  fileName?: string;
  fileMime?: string;
};

type CreatePairBody = {
  projectId: string;
  folderId?: string | null;
  clientEstimate?: SideInput;
  internalEstimate?: SideInput;
  replaceExisting?: boolean;
  createNewVersion?: boolean;
};

function sanitizeItems(items: ParsedItemInput[] | undefined): ParsedItemInput[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      description: String(it.description ?? "").trim().slice(0, 1000),
      unit: String(it.unit ?? "шт").trim().slice(0, 50),
      quantity: Number.isFinite(Number(it.quantity)) && Number(it.quantity) > 0 ? Number(it.quantity) : 1,
      unitPrice: Number.isFinite(Number(it.unitPrice)) && Number(it.unitPrice) >= 0 ? Number(it.unitPrice) : 0,
      totalPrice: Number.isFinite(Number(it.totalPrice)) && Number(it.totalPrice) >= 0 ? Number(it.totalPrice) : 0,
      category: it.category && typeof it.category === "string" ? it.category.slice(0, 100) : null,
    }))
    .filter((it) => it.description.length > 0);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  try {
    const body: CreatePairBody = await request.json();
    const { projectId, folderId, clientEstimate, internalEstimate, replaceExisting, createNewVersion } = body;
    const normalizedFolderId = typeof folderId === "string" && folderId.trim() ? folderId.trim() : null;

    if (!projectId) {
      return NextResponse.json({ error: "projectId обов'язковий" }, { status: 400 });
    }

    if (!clientEstimate && !internalEstimate) {
      return NextResponse.json(
        { error: "Має бути принаймні один кошторис (клієнт або Metrum)" },
        { status: 400 },
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, title: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Проєкт не існує" }, { status: 404 });
    }

    // Check for existing pair for this project
    const existingPair = await prisma.estimate.findFirst({
      where: {
        projectId,
        role: { in: ["CLIENT", "INTERNAL"] },
      },
      select: { id: true, estimateGroupId: true, version: true, role: true, title: true },
      orderBy: { version: "desc" },
    });

    if (existingPair && !replaceExisting && !createNewVersion) {
      return NextResponse.json(
        {
          error: "existing_pair",
          message: "Для цього проєкту вже є кошториси",
          existing: existingPair,
        },
        { status: 409 },
      );
    }

    // Determine version
    let nextVersion = 1;
    if (existingPair) {
      if (createNewVersion) {
        const maxVersion = await prisma.estimate.aggregate({
          where: { projectId, role: { in: ["CLIENT", "INTERNAL"] } },
          _max: { version: true },
        });
        nextVersion = (maxVersion._max.version ?? 0) + 1;
      } else if (replaceExisting) {
        // Delete all existing CLIENT/INTERNAL estimates for this project
        // This also cascades to EstimateItem and the FinanceEntry (ESTIMATE_AUTO)
        // will be removed inside syncEstimateToFinancing on next call, but we should
        // also clean up finance entries directly in case no new estimate replaces them.
        const old = await prisma.estimate.findMany({
          where: { projectId, role: { in: ["CLIENT", "INTERNAL"] } },
          select: { id: true },
        });
        const oldIds = old.map((e) => e.id);

        await prisma.$transaction([
          prisma.financeEntry.deleteMany({
            where: { estimateId: { in: oldIds }, source: "ESTIMATE_AUTO" },
          }),
          prisma.estimateItem.deleteMany({
            where: { estimateId: { in: oldIds } },
          }),
          prisma.estimate.deleteMany({
            where: { id: { in: oldIds } },
          }),
        ]);
      }
    }

    const groupId = `pair_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const clientItems = sanitizeItems(clientEstimate?.items);
    const internalItems = sanitizeItems(internalEstimate?.items);

    const clientTotal = clientEstimate?.totalAmount
      ? Number(clientEstimate.totalAmount)
      : clientItems.reduce((s, i) => s + i.totalPrice, 0);
    const internalTotal = internalEstimate?.totalAmount
      ? Number(internalEstimate.totalAmount)
      : internalItems.reduce((s, i) => s + i.totalPrice, 0);

    // Create both estimates in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let clientEst: { id: string; number: string } | null = null;
      let internalEst: { id: string; number: string } | null = null;

      if (clientEstimate && clientItems.length > 0) {
        const number = `PAIR-C-${Date.now()}`;
        clientEst = await tx.estimate.create({
          data: {
            number,
            title: clientEstimate.title?.trim() || `Кошторис клієнта — ${project.title}`,
            status: "DRAFT",
            version: nextVersion,
            role: "CLIENT",
            estimateGroupId: groupId,
            projectId,
            createdById: session.user.id,
            totalAmount: new Prisma.Decimal(clientTotal),
            finalAmount: new Prisma.Decimal(clientTotal),
            finalClientPrice: new Prisma.Decimal(clientTotal),
            folderId: normalizedFolderId,
            sourceFileR2Key: clientEstimate.fileR2Key ?? null,
            sourceFileName: clientEstimate.fileName ?? null,
            sourceFileMime: clientEstimate.fileMime ?? null,
            items: {
              create: clientItems.map((it, idx) => ({
                description: it.description,
                unit: it.unit,
                quantity: new Prisma.Decimal(it.quantity),
                unitPrice: new Prisma.Decimal(it.unitPrice),
                amount: new Prisma.Decimal(it.totalPrice),
                priceWithMargin: new Prisma.Decimal(it.totalPrice),
                sortOrder: idx,
              })),
            },
          },
          select: { id: true, number: true },
        });
      }

      if (internalEstimate && internalItems.length > 0) {
        const number = `PAIR-I-${Date.now()}`;
        internalEst = await tx.estimate.create({
          data: {
            number,
            title: internalEstimate.title?.trim() || `Кошторис Metrum — ${project.title}`,
            status: "DRAFT",
            version: nextVersion,
            role: "INTERNAL",
            estimateGroupId: groupId,
            projectId,
            createdById: session.user.id,
            totalAmount: new Prisma.Decimal(internalTotal),
            finalAmount: new Prisma.Decimal(internalTotal),
            finalClientPrice: new Prisma.Decimal(0),
            folderId: normalizedFolderId,
            sourceFileR2Key: internalEstimate.fileR2Key ?? null,
            sourceFileName: internalEstimate.fileName ?? null,
            sourceFileMime: internalEstimate.fileMime ?? null,
            items: {
              create: internalItems.map((it, idx) => ({
                description: it.description,
                unit: it.unit,
                quantity: new Prisma.Decimal(it.quantity),
                unitPrice: new Prisma.Decimal(it.unitPrice),
                amount: new Prisma.Decimal(it.totalPrice),
                priceWithMargin: new Prisma.Decimal(it.totalPrice),
                sortOrder: idx,
              })),
            },
          },
          select: { id: true, number: true },
        });
      }

      // Cross-link
      if (clientEst && internalEst) {
        await tx.estimate.update({
          where: { id: clientEst.id },
          data: { pairedEstimateId: internalEst.id },
        });
        await tx.estimate.update({
          where: { id: internalEst.id },
          data: { pairedEstimateId: clientEst.id },
        });
      }

      return { clientEst, internalEst };
    });

    // Sync to financing (outside transaction — uses own transactions)
    let clientSync = null;
    let internalSync = null;
    if (result.clientEst) {
      try {
        clientSync = await syncEstimateToFinancing(result.clientEst.id, session.user.id);
      } catch (err) {
        console.error("[create-pair] client sync failed:", err);
      }
    }
    if (result.internalEst) {
      try {
        internalSync = await syncEstimateToFinancing(result.internalEst.id, session.user.id);
      } catch (err) {
        console.error("[create-pair] internal sync failed:", err);
      }
    }

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "Estimate",
      entityId: result.clientEst?.id ?? result.internalEst?.id ?? "pair",
      projectId,
      newData: {
        estimateGroupId: groupId,
        version: nextVersion,
        clientEstimateId: result.clientEst?.id,
        internalEstimateId: result.internalEst?.id,
        clientTotal,
        internalTotal,
        clientItemsCount: clientItems.length,
        internalItemsCount: internalItems.length,
      },
    });

    return NextResponse.json({
      estimateGroupId: groupId,
      version: nextVersion,
      client: result.clientEst,
      internal: result.internalEst,
      sync: {
        client: clientSync,
        internal: internalSync,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[estimates/create-pair] error:", error);
    const msg = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
