import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { CostType } from "@prisma/client";
import { recomputeEstimateTotals } from "./recompute";
import { assertEstimateEditable } from "./version-lock";

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
  itemType: string | null;
  parentItemId: string | null;
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
  itemType?: string | null;
  parentItemId?: string | null;
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
    itemType: row.itemType ?? null,
    parentItemId: row.parentItemId ?? null,
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
  /** Собівартість (для фірми). Якщо null/undefined — backend == unitPrice. */
  unitCost?: number | null;
  /** Ціна для замовника. Якщо null/undefined — backend == unitPrice × 1.20. */
  unitPriceCustomer?: number | null;
  /** Виконроб (FK → User) для звітування. Null → fallback на stage.responsibleUserId. */
  foremanId?: string | null;
  /** Виконавець (free-form: бригада/майстер). */
  executorText?: string | null;
  costCodeId?: string | null;
  costType?: CostType | null;
  itemType?: string | null;
  parentItemId?: string | null;
  userId: string;
}): Promise<EstimateItemDTO> {
  // Блок: якщо активна версія кошторису заморожена — заборонено мутувати items.
  await assertEstimateEditable(opts.estimateId);
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

  // Робота ніколи не має парента. Якщо клієнт випадково передав parentItemId
  // для itemType="work" — занулюємо.
  let parentItemId: string | null | undefined =
    "parentItemId" in opts ? opts.parentItemId ?? null : undefined;
  if (opts.itemType === "work") parentItemId = null;

  if (parentItemId) {
    const parent = await prisma.estimateItem.findUnique({
      where: { id: parentItemId },
      select: { sectionId: true, itemType: true },
    });
    if (!parent || parent.sectionId !== opts.sectionId) {
      throw new Error("Парент має бути в тій же секції");
    }
    if (parent.itemType === "material") {
      throw new Error("Парент має бути роботою");
    }
  }

  // Резолв нових цінових полів:
  //   unitCost = opts.unitCost ?? opts.unitPrice (legacy semantic).
  //   unitPriceCustomer = opts.unitPriceCustomer ?? unitCost × 1.20.
  // Дефолтна маржа 20% узгоджена з Estimate.profitMarginOverall.
  const unitCost =
    opts.unitCost !== undefined && opts.unitCost !== null
      ? opts.unitCost
      : opts.unitPrice;
  const unitPriceCustomer =
    opts.unitPriceCustomer !== undefined && opts.unitPriceCustomer !== null
      ? opts.unitPriceCustomer
      : new Decimal(unitCost).times(1.2).toNumber();

  const item = await prisma.estimateItem.create({
    data: {
      estimateId: opts.estimateId,
      sectionId: opts.sectionId,
      description,
      unit,
      quantity: opts.quantity,
      unitPrice: opts.unitPrice,
      unitCost,
      unitPriceCustomer,
      ...("foremanId" in opts ? { foremanId: opts.foremanId ?? null } : {}),
      ...("executorText" in opts ? { executorText: opts.executorText ?? null } : {}),
      amount,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      ...costFields,
      ...("itemType" in opts ? { itemType: opts.itemType ?? null } : {}),
      ...(parentItemId !== undefined ? { parentItemId } : {}),
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
    unitCost?: number | null;
    unitPriceCustomer?: number | null;
    foremanId?: string | null;
    executorText?: string | null;
    costCodeId?: string | null;
    costType?: CostType | null;
    itemType?: string | null;
    parentItemId?: string | null;
  };
  userId: string;
}): Promise<EstimateItemDTO> {
  const existing = await prisma.estimateItem.findUnique({
    where: { id: opts.itemId },
    select: {
      id: true,
      estimateId: true,
      sectionId: true,
      description: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      unitCost: true,
      unitPriceCustomer: true,
      foremanId: true,
      executorText: true,
      costCodeId: true,
      costType: true,
      itemType: true,
      parentItemId: true,
    },
  });
  if (!existing) throw new Error("Позицію не знайдено");
  await assertEstimateEditable(existing.estimateId);

  const oldDescription = existing.description;
  const oldUnit = existing.unit;
  const oldQuantity = Number(existing.quantity);
  const oldUnitPrice = Number(existing.unitPrice);
  const oldCostCodeId = existing.costCodeId;
  const oldCostType = existing.costType;
  const oldItemType = existing.itemType;
  const oldParentItemId = existing.parentItemId;

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

  // Резолвимо нові значення для itemType / parentItemId з врахуванням інваріантів:
  // - work не може мати парента (занулюємо)
  // - parentItemId має бути в тій же секції і вказувати на work
  const newItemType =
    "itemType" in opts.patch ? opts.patch.itemType ?? null : oldItemType;
  let newParentItemId =
    "parentItemId" in opts.patch ? opts.patch.parentItemId ?? null : oldParentItemId;
  if (newItemType === "work") newParentItemId = null;
  if (newParentItemId && newParentItemId !== oldParentItemId) {
    if (newParentItemId === opts.itemId) {
      throw new Error("Парент не може посилатись на саму позицію");
    }
    const parent = await prisma.estimateItem.findUnique({
      where: { id: newParentItemId },
      select: { sectionId: true, itemType: true },
    });
    if (!parent || parent.sectionId !== existing.sectionId) {
      throw new Error("Парент має бути в тій же секції");
    }
    if (parent.itemType === "material") {
      throw new Error("Парент має бути роботою");
    }
  }

  const updated = await prisma.estimateItem.update({
    where: { id: opts.itemId },
    data: {
      ...(opts.patch.description !== undefined && { description: newDescription }),
      ...(opts.patch.unit !== undefined && { unit: newUnit }),
      quantity: newQuantity,
      unitPrice: newUnitPrice,
      amount: newAmount,
      ...("unitCost" in opts.patch ? { unitCost: opts.patch.unitCost } : {}),
      ...("unitPriceCustomer" in opts.patch
        ? { unitPriceCustomer: opts.patch.unitPriceCustomer }
        : {}),
      ...("foremanId" in opts.patch ? { foremanId: opts.patch.foremanId } : {}),
      ...("executorText" in opts.patch
        ? { executorText: opts.patch.executorText }
        : {}),
      ...costFields,
      ...("itemType" in opts.patch ? { itemType: newItemType } : {}),
      ...("itemType" in opts.patch || "parentItemId" in opts.patch
        ? { parentItemId: newParentItemId }
        : {}),
    },
    include: { costCode: { select: { id: true, code: true, name: true } } },
  });

  // Якщо позицію перетворили на матеріал — її колишні діти втрачають парента.
  // Onclick onDelete: SetNull у схемі вже подбає при видаленні; тут робимо
  // явний detach при зміні типу, щоб не залишити "матеріал має дітей-матеріалів".
  if (
    "itemType" in opts.patch &&
    oldItemType !== "material" &&
    newItemType === "material"
  ) {
    await prisma.estimateItem.updateMany({
      where: { parentItemId: opts.itemId },
      data: { parentItemId: null },
    });
  }

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
  if ("itemType" in opts.patch && newItemType !== oldItemType) {
    changes.push({ field: "itemType", oldValue: oldItemType, newValue: newItemType });
  }
  if (
    ("parentItemId" in opts.patch || "itemType" in opts.patch) &&
    newParentItemId !== oldParentItemId
  ) {
    changes.push({
      field: "parentItemId",
      oldValue: oldParentItemId,
      newValue: newParentItemId,
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
  await assertEstimateEditable(existing.estimateId);

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
