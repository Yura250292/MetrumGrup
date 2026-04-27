import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Prisma, type ReceiptScanSource, type ReceiptScan, type ReceiptLineItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { r2Client } from "@/lib/r2-client";
import { ocrReceiptStructured } from "@/lib/ocr/receipt-ocr";
import {
  classifyMatch,
  invalidateMaterialMatcherCache,
  matchMaterial,
  proposeNewMaterial,
} from "@/lib/matching/material-matcher";
import { findOrCreateProjectWarehouse } from "@/lib/warehouse/project-warehouse";
import type { LineItemMatchInput } from "@/lib/schemas/receipt";

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "metrum";
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class ReceiptScanError extends Error {
  constructor(message: string, public statusHint: number = 400) {
    super(message);
    this.name = "ReceiptScanError";
  }
}

export interface CreateScanInput {
  projectId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  notes?: string;
  createdById: string;
  source: ReceiptScanSource;
}

function safeFileSegment(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80) || "receipt";
}

async function uploadScanFile(buffer: Buffer, mimeType: string, originalName: string): Promise<string> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const key = `receipts/${ts}-${rand}-${safeFileSegment(originalName)}`;
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
  return key;
}

export interface CreateScanResult {
  scanId: string;
  unmatchedCount: number;
  suggestedCount: number;
  matchedCount: number;
  totalItems: number;
}

/**
 * End-to-end scan creation: validates input, uploads to R2, runs structured
 * OCR, fuzzy-matches each line item, persists ReceiptScan + line items.
 * Throws ReceiptScanError on validation issues.
 */
export async function createScanFromFile(input: CreateScanInput): Promise<CreateScanResult> {
  if (!input.projectId) throw new ReceiptScanError("projectId required");
  if (!input.buffer?.length) throw new ReceiptScanError("Empty file");
  if (input.buffer.length > MAX_FILE_BYTES) {
    throw new ReceiptScanError("Файл завеликий (макс 20 МБ)", 413);
  }
  if (!ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new ReceiptScanError("Підтримуються JPG, PNG, WebP або PDF", 415);
  }

  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
  if (!project) throw new ReceiptScanError("Проєкт не знайдено", 404);

  const fileR2Key = await uploadScanFile(input.buffer, input.mimeType, input.originalName);

  const ocr = await ocrReceiptStructured(input.buffer, input.mimeType);

  const scan = await prisma.$transaction(async (tx) => {
    const created = await tx.receiptScan.create({
      data: {
        projectId: input.projectId,
        status: "PENDING",
        source: input.source,
        supplier: ocr.parsed.supplier,
        documentDate: ocr.parsed.documentDate ?? undefined,
        totalAmount: ocr.parsed.totalAmount ?? undefined,
        currency: ocr.parsed.currency,
        ocrText: ocr.raw,
        ocrJson: ocr.parsed as unknown as Prisma.InputJsonValue,
        fileR2Key,
        fileMimeType: input.mimeType,
        fileOriginalName: input.originalName,
        notes: input.notes,
        createdById: input.createdById,
      },
    });

    let sortOrder = 0;
    for (const item of ocr.parsed.items) {
      const candidates = await matchMaterial(item.name, { topN: 1 });
      const best = candidates[0];
      const status = best ? classifyMatch(best.score) : "UNMATCHED";
      const proposal = best && best.score >= 0.8 ? null : proposeNewMaterial(item.name, item.unit);

      await tx.receiptLineItem.create({
        data: {
          scanId: created.id,
          rawName: item.name,
          rawUnit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice ?? undefined,
          status,
          matchedMaterialId: status === "MATCHED" ? best!.material.id : null,
          matchConfidence: best?.score ?? null,
          proposedSku: proposal?.sku,
          proposedCategory: proposal?.category,
          sortOrder: sortOrder++,
        },
      });
    }

    return created;
  });

  const counts = await prisma.receiptLineItem.groupBy({
    by: ["status"],
    where: { scanId: scan.id },
    _count: true,
  });
  const totals = { matched: 0, suggested: 0, unmatched: 0, total: 0 };
  for (const c of counts) {
    totals.total += c._count;
    if (c.status === "MATCHED") totals.matched += c._count;
    if (c.status === "SUGGESTED") totals.suggested += c._count;
    if (c.status === "UNMATCHED") totals.unmatched += c._count;
  }

  return {
    scanId: scan.id,
    matchedCount: totals.matched,
    suggestedCount: totals.suggested,
    unmatchedCount: totals.unmatched,
    totalItems: totals.total,
  };
}

export async function rejectScan(
  scanId: string,
  approverId: string,
  reason: string,
): Promise<ReceiptScan> {
  return prisma.receiptScan.update({
    where: { id: scanId, status: "PENDING" },
    data: {
      status: "REJECTED",
      approvedById: approverId,
      approvedAt: new Date(),
      rejectionReason: reason,
    },
  });
}

export async function matchLineItem(
  scanId: string,
  lineItemId: string,
  payload: LineItemMatchInput,
  _userId: string,
): Promise<ReceiptLineItem> {
  const item = await prisma.receiptLineItem.findFirst({
    where: { id: lineItemId, scanId },
  });
  if (!item) throw new ReceiptScanError("Line item not found", 404);

  const editPatch = (() => {
    if (payload.action === "skip") return {};
    const edits = payload.action === "edit" ? payload.edits : payload.edits;
    if (!edits) return {};
    return {
      quantity: edits.quantity ?? undefined,
      unitPrice: edits.unitPrice ?? undefined,
      rawUnit: edits.rawUnit ?? undefined,
      notes: edits.notes ?? undefined,
    };
  })();

  if (payload.action === "skip") {
    return prisma.receiptLineItem.update({
      where: { id: item.id },
      data: { status: "SKIPPED", ...editPatch },
    });
  }

  if (payload.action === "edit") {
    return prisma.receiptLineItem.update({
      where: { id: item.id },
      data: editPatch,
    });
  }

  if (payload.action === "match") {
    const material = await prisma.material.findUnique({ where: { id: payload.materialId } });
    if (!material) throw new ReceiptScanError("Material not found", 404);
    return prisma.receiptLineItem.update({
      where: { id: item.id },
      data: {
        status: "CONFIRMED",
        matchedMaterialId: material.id,
        matchConfidence: 1,
        ...editPatch,
      },
    });
  }

  // action === "create"
  const data = payload.newMaterial;
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.material.findUnique({ where: { sku: data.sku } });
    const material = existing
      ? existing
      : await tx.material.create({
          data: {
            name: data.name,
            sku: data.sku,
            category: data.category,
            unit: data.unit,
            basePrice: data.basePrice,
          },
        });
    return tx.receiptLineItem.update({
      where: { id: item.id },
      data: {
        status: "CREATE_NEW",
        matchedMaterialId: material.id,
        matchConfidence: 1,
        ...editPatch,
      },
    });
  });
  invalidateMaterialMatcherCache();
  return updated;
}

export interface ApprovedScanSummary {
  scanId: string;
  warehouseId: string;
  financeEntryId: string;
  postedItems: number;
  skippedItems: number;
}

/**
 * Approve a scan atomically. Race-protected via where: { status: PENDING }
 * inside the transaction — concurrent approvals roll back on P2025.
 */
export async function approveScan(scanId: string, approverId: string): Promise<ApprovedScanSummary> {
  const preflight = await prisma.receiptScan.findUnique({
    where: { id: scanId },
    include: { lineItems: true },
  });
  if (!preflight) throw new ReceiptScanError("Скан не знайдено", 404);
  if (preflight.status !== "PENDING") {
    throw new ReceiptScanError(`Скан вже у статусі ${preflight.status}`, 409);
  }
  const unresolved = preflight.lineItems.filter(
    (li) => li.status === "UNMATCHED" || li.status === "SUGGESTED",
  );
  if (unresolved.length > 0) {
    throw new ReceiptScanError(
      `Залишились непідтверджені позиції (${unresolved.length}). Підтвердіть або пропустіть кожну.`,
      422,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const scan = await tx.receiptScan.update({
      where: { id: scanId, status: "PENDING" },
      data: {
        status: "APPROVED",
        approvedById: approverId,
        approvedAt: new Date(),
      },
      include: { lineItems: true },
    });

    const warehouse = await findOrCreateProjectWarehouse(scan.projectId, tx);

    const supplierTitle = scan.supplier ? ` (${scan.supplier})` : "";
    const occurredAt = scan.documentDate ?? new Date();

    // Resolve / create Counterparty FK from scan.supplier (free-text → entity).
    // Idempotent — case-insensitive match before creating.
    let counterpartyId: string | undefined;
    if (scan.supplier && scan.supplier.trim()) {
      const supplierName = scan.supplier.trim().replace(/\s+/g, " ");
      const existing = await tx.counterparty.findFirst({
        where: { name: { equals: supplierName, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        counterpartyId = existing.id;
      } else {
        const created = await tx.counterparty.create({
          data: { name: supplierName, type: "LEGAL", isActive: true },
          select: { id: true },
        });
        counterpartyId = created.id;
      }
    }

    const fe = await tx.financeEntry.create({
      data: {
        type: "EXPENSE",
        kind: "FACT",
        status: "APPROVED",
        amount: scan.totalAmount ?? 0,
        currency: scan.currency,
        projectId: scan.projectId,
        category: "materials",
        costType: "MATERIAL",
        title: `Накладна${supplierTitle}`,
        description: scan.ocrText ?? undefined,
        counterparty: scan.supplier ?? undefined,
        counterpartyId,
        occurredAt,
        createdById: scan.createdById,
        approvedById: approverId,
        approvedAt: new Date(),
        source: "MANUAL",
      },
    });

    if (scan.fileR2Key) {
      await tx.financeEntryAttachment.create({
        data: {
          entryId: fe.id,
          r2Key: scan.fileR2Key,
          originalName: scan.fileOriginalName ?? "receipt",
          mimeType: scan.fileMimeType ?? "application/octet-stream",
          size: 0,
          uploadedById: scan.createdById,
        },
      });
    }

    let postedItems = 0;
    let skippedItems = 0;
    for (const item of scan.lineItems) {
      if (item.status === "SKIPPED") {
        skippedItems++;
        continue;
      }
      if (!item.matchedMaterialId) {
        throw new ReceiptScanError(
          `Позиція "${item.rawName}" без прив'язаного Material`,
          422,
        );
      }

      const inv = await tx.inventoryItem.upsert({
        where: {
          materialId_warehouseId: {
            materialId: item.matchedMaterialId,
            warehouseId: warehouse.id,
          },
        },
        update: {
          quantity: { increment: item.quantity },
          lastRestockedAt: new Date(),
        },
        create: {
          materialId: item.matchedMaterialId,
          warehouseId: warehouse.id,
          quantity: item.quantity,
          lastRestockedAt: new Date(),
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          type: "PURCHASE",
          quantity: item.quantity,
          inventoryItemId: inv.id,
          projectId: scan.projectId,
          createdById: scan.createdById,
          notes: `Накладна #${scan.id}`,
        },
      });

      await tx.materialPriceSnapshot.create({
        data: {
          materialId: item.matchedMaterialId,
          price: item.unitPrice,
          unit: item.rawUnit ?? "шт",
          quantity: item.quantity,
          supplier: scan.supplier ?? undefined,
          source: "RECEIPT_SCAN",
          occurredAt,
          projectId: scan.projectId,
          warehouseId: warehouse.id,
          receiptScanId: scan.id,
          receiptLineItemId: item.id,
          financeEntryId: fe.id,
          createdById: approverId,
        },
      });

      postedItems++;
    }

    await tx.receiptScan.update({
      where: { id: scan.id },
      data: { financeEntryId: fe.id, warehouseId: warehouse.id },
    });

    return {
      scanId: scan.id,
      warehouseId: warehouse.id,
      financeEntryId: fe.id,
      postedItems,
      skippedItems,
    };
  });

  return result;
}
