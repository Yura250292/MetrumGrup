import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { CostType } from "@prisma/client";
import { recomputeEstimateTotals } from "./recompute";

const COST_TYPES: CostType[] = [
  "MATERIAL",
  "LABOR",
  "SUBCONTRACT",
  "EQUIPMENT",
  "OVERHEAD",
  "OTHER",
];

export function normalizeCostType(value: unknown): CostType | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  return COST_TYPES.includes(value as CostType) ? (value as CostType) : null;
}

/**
 * Запис критичної зміни кошторису. Викликається з функцій нижче після
 * успішного оновлення позиції — щоб вкладка "Історія" показувала, хто
 * саме і коли виправив ціну/кількість/опис, додав чи видалив позицію.
 *
 * Помилка логування не повинна валити саму операцію редагування —
 * тому обгорнуто в try/catch.
 */
async function logCriticalChange(input: {
  estimateId: string;
  userId: string;
  changeType: string;
  fieldName: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.estimateCriticalChange.create({
      data: {
        estimateId: input.estimateId,
        userId: input.userId,
        changeType: input.changeType,
        fieldName: input.fieldName,
        oldValue: input.oldValue === undefined ? undefined : (input.oldValue as never),
        newValue: input.newValue === undefined ? undefined : (input.newValue as never),
        metadata: input.metadata === undefined ? undefined : (input.metadata as never),
      },
    });
  } catch (err) {
    console.error("[items-service] failed to log critical change", err);
  }
}

export type EstimateItemCostCodeDTO = {
  id: string;
  code: string;
  name: string;
};

export type EstimateItemDTO = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
  sectionId: string | null;
  costCodeId: string | null;
  costType: CostType | null;
  costCode: EstimateItemCostCodeDTO | null;
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
  costCodeId: string | null;
  costType: CostType | null;
  costCode?: { id: string; code: string; name: string } | null;
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
    costCodeId: row.costCodeId,
    costType: row.costType,
    costCode: row.costCode
      ? { id: row.costCode.id, code: row.costCode.code, name: row.costCode.name }
      : null,
  };
}

/**
 * Returns only the cost fields that the caller actually intends to patch.
 * If the operator sets a cost-code without an explicit costType, the code's
 * defaultCostType is filled in so the budget-vs-actual matrix groups items
 * correctly without a second click.
 */
async function resolveCostFields(input: {
  costCodeId?: string | null;
  costType?: CostType | null;
}): Promise<Partial<{ costCodeId: string | null; costType: CostType | null }>> {
  const hasCostCode = "costCodeId" in input;
  const hasCostType = "costType" in input;
  if (!hasCostCode && !hasCostType) return {};

  const out: Partial<{ costCodeId: string | null; costType: CostType | null }> = {};
  if (hasCostCode) out.costCodeId = input.costCodeId ?? null;
  if (hasCostType) out.costType = input.costType ?? null;

  if (hasCostCode && out.costCodeId && !hasCostType) {
    const cc = await prisma.costCode.findUnique({
      where: { id: out.costCodeId },
      select: { defaultCostType: true },
    });
    if (!cc) throw new Error("Cost code not found");
    out.costType = cc.defaultCostType ?? null;
  }

  return out;
}

export async function addEstimateItem(opts: {
  estimateId: string;
  sectionId: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  costCodeId?: string | null;
  costType?: CostType | null;
  userId: string;
}): Promise<EstimateItemDTO> {
  const section = await prisma.estimateSection.findUnique({
    where: { id: opts.sectionId },
    select: { id: true, estimateId: true, title: true },
  });
  if (!section || section.estimateId !== opts.estimateId) {
    throw new Error("Секцію не знайдено");
  }

  const maxSort = await prisma.estimateItem.aggregate({
    where: { sectionId: opts.sectionId },
    _max: { sortOrder: true },
  });

  const amount = new Decimal(opts.quantity).times(opts.unitPrice).toFixed(2);
  const description = opts.description.trim() || "Нова позиція";
  const unit = opts.unit.trim() || "шт";

  const costFields = await resolveCostFields({
    ...("costCodeId" in opts ? { costCodeId: opts.costCodeId } : {}),
    ...("costType" in opts ? { costType: opts.costType } : {}),
  });

  const item = await prisma.estimateItem.create({
    data: {
      estimateId: opts.estimateId,
      sectionId: opts.sectionId,
      description,
      unit,
      quantity: opts.quantity,
      unitPrice: opts.unitPrice,
      amount,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      ...costFields,
    },
    include: { costCode: { select: { id: true, code: true, name: true } } },
  });

  await recomputeEstimateTotals(opts.estimateId);

  await logCriticalChange({
    estimateId: opts.estimateId,
    userId: opts.userId,
    changeType: "ITEM_ADDED",
    fieldName: "items",
    newValue: {
      description,
      unit,
      quantity: opts.quantity,
      unitPrice: opts.unitPrice,
      amount: Number(amount),
    },
    metadata: {
      itemId: item.id,
      sectionId: section.id,
      sectionTitle: section.title,
    },
  });

  return toDTO(item);
}

export async function updateEstimateItem(opts: {
  itemId: string;
  patch: {
    description?: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
    costCodeId?: string | null;
    costType?: CostType | null;
  };
  userId: string;
}): Promise<EstimateItemDTO> {
  const existing = await prisma.estimateItem.findUnique({
    where: { id: opts.itemId },
    select: {
      id: true,
      estimateId: true,
      description: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      costCodeId: true,
      costType: true,
    },
  });
  if (!existing) throw new Error("Позицію не знайдено");

  const oldDescription = existing.description;
  const oldUnit = existing.unit;
  const oldQuantity = Number(existing.quantity);
  const oldUnitPrice = Number(existing.unitPrice);
  const oldCostCodeId = existing.costCodeId;
  const oldCostType = existing.costType;

  const newDescription =
    opts.patch.description !== undefined ? opts.patch.description.trim() : oldDescription;
  const newUnit = opts.patch.unit !== undefined ? opts.patch.unit.trim() : oldUnit;
  const newQuantity =
    opts.patch.quantity !== undefined ? opts.patch.quantity : oldQuantity;
  const newUnitPrice =
    opts.patch.unitPrice !== undefined ? opts.patch.unitPrice : oldUnitPrice;
  const newAmount = new Decimal(newQuantity).times(newUnitPrice).toFixed(2);

  const costFields = await resolveCostFields({
    ...("costCodeId" in opts.patch ? { costCodeId: opts.patch.costCodeId } : {}),
    ...("costType" in opts.patch ? { costType: opts.patch.costType } : {}),
  });

  const updated = await prisma.estimateItem.update({
    where: { id: opts.itemId },
    data: {
      ...(opts.patch.description !== undefined && { description: newDescription }),
      ...(opts.patch.unit !== undefined && { unit: newUnit }),
      quantity: newQuantity,
      unitPrice: newUnitPrice,
      amount: newAmount,
      ...costFields,
    },
    include: { costCode: { select: { id: true, code: true, name: true } } },
  });

  await recomputeEstimateTotals(existing.estimateId);

  // Залогувати всі змінені поля окремими записами, щоб timeline міг
  // показати "Інженер змінив ціну з X на Y" для кожного поля.
  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
  if (opts.patch.description !== undefined && newDescription !== oldDescription) {
    changes.push({ field: "description", oldValue: oldDescription, newValue: newDescription });
  }
  if (opts.patch.unit !== undefined && newUnit !== oldUnit) {
    changes.push({ field: "unit", oldValue: oldUnit, newValue: newUnit });
  }
  if (opts.patch.quantity !== undefined && newQuantity !== oldQuantity) {
    changes.push({ field: "quantity", oldValue: oldQuantity, newValue: newQuantity });
  }
  if (opts.patch.unitPrice !== undefined && newUnitPrice !== oldUnitPrice) {
    changes.push({ field: "unitPrice", oldValue: oldUnitPrice, newValue: newUnitPrice });
  }
  if (
    "costCodeId" in costFields &&
    (costFields.costCodeId ?? null) !== oldCostCodeId
  ) {
    changes.push({
      field: "costCodeId",
      oldValue: oldCostCodeId,
      newValue: costFields.costCodeId ?? null,
    });
  }
  if (
    "costType" in costFields &&
    (costFields.costType ?? null) !== oldCostType
  ) {
    changes.push({
      field: "costType",
      oldValue: oldCostType,
      newValue: costFields.costType ?? null,
    });
  }

  for (const change of changes) {
    await logCriticalChange({
      estimateId: existing.estimateId,
      userId: opts.userId,
      changeType: "ITEM_FIELD_CHANGED",
      fieldName: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      metadata: {
        itemId: existing.id,
        itemDescription: newDescription,
      },
    });
  }

  return toDTO(updated);
}

export async function deleteEstimateItem(
  itemId: string,
  opts: { userId: string }
): Promise<void> {
  const existing = await prisma.estimateItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      estimateId: true,
      description: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      amount: true,
    },
  });
  if (!existing) throw new Error("Позицію не знайдено");

  await prisma.estimateItem.delete({ where: { id: itemId } });
  await recomputeEstimateTotals(existing.estimateId);

  await logCriticalChange({
    estimateId: existing.estimateId,
    userId: opts.userId,
    changeType: "ITEM_REMOVED",
    fieldName: "items",
    oldValue: {
      description: existing.description,
      unit: existing.unit,
      quantity: Number(existing.quantity),
      unitPrice: Number(existing.unitPrice),
      amount: Number(existing.amount),
    },
    metadata: {
      itemId: existing.id,
      itemDescription: existing.description,
    },
  });
}
