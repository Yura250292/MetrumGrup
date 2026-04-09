import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { recomputeEstimateTotals } from "./recompute";

export type EstimateItemDTO = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
  sectionId: string | null;
};

function toDTO(row: {
  id: string;
  description: string;
  unit: string;
  quantity: Decimal | number | string;
  unitPrice: Decimal | number | string;
  amount: Decimal | number | string;
  sortOrder: number;
  sectionId: string | null;
}): EstimateItemDTO {
  return {
    id: row.id,
    description: row.description,
    unit: row.unit,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    amount: Number(row.amount),
    sortOrder: row.sortOrder,
    sectionId: row.sectionId,
  };
}

export async function addEstimateItem(opts: {
  estimateId: string;
  sectionId: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}): Promise<EstimateItemDTO> {
  const section = await prisma.estimateSection.findUnique({
    where: { id: opts.sectionId },
    select: { id: true, estimateId: true },
  });
  if (!section || section.estimateId !== opts.estimateId) {
    throw new Error("Секцію не знайдено");
  }

  const maxSort = await prisma.estimateItem.aggregate({
    where: { sectionId: opts.sectionId },
    _max: { sortOrder: true },
  });

  const amount = new Decimal(opts.quantity).times(opts.unitPrice).toFixed(2);

  const item = await prisma.estimateItem.create({
    data: {
      estimateId: opts.estimateId,
      sectionId: opts.sectionId,
      description: opts.description.trim() || "Нова позиція",
      unit: opts.unit.trim() || "шт",
      quantity: opts.quantity,
      unitPrice: opts.unitPrice,
      amount,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await recomputeEstimateTotals(opts.estimateId);
  return toDTO(item);
}

export async function updateEstimateItem(opts: {
  itemId: string;
  patch: {
    description?: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
  };
}): Promise<EstimateItemDTO> {
  const existing = await prisma.estimateItem.findUnique({
    where: { id: opts.itemId },
    select: {
      id: true,
      estimateId: true,
      quantity: true,
      unitPrice: true,
    },
  });
  if (!existing) throw new Error("Позицію не знайдено");

  const newQuantity =
    opts.patch.quantity !== undefined ? opts.patch.quantity : Number(existing.quantity);
  const newUnitPrice =
    opts.patch.unitPrice !== undefined ? opts.patch.unitPrice : Number(existing.unitPrice);
  const newAmount = new Decimal(newQuantity).times(newUnitPrice).toFixed(2);

  const updated = await prisma.estimateItem.update({
    where: { id: opts.itemId },
    data: {
      ...(opts.patch.description !== undefined && {
        description: opts.patch.description.trim(),
      }),
      ...(opts.patch.unit !== undefined && { unit: opts.patch.unit.trim() }),
      quantity: newQuantity,
      unitPrice: newUnitPrice,
      amount: newAmount,
    },
  });

  await recomputeEstimateTotals(existing.estimateId);
  return toDTO(updated);
}

export async function deleteEstimateItem(itemId: string): Promise<void> {
  const existing = await prisma.estimateItem.findUnique({
    where: { id: itemId },
    select: { id: true, estimateId: true },
  });
  if (!existing) throw new Error("Позицію не знайдено");

  await prisma.estimateItem.delete({ where: { id: itemId } });
  await recomputeEstimateTotals(existing.estimateId);
}
