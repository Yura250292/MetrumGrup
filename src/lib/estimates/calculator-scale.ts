/**
 * Linear-by-area scaling for reference estimates.
 *
 * Single source of truth used by both the calculator modal preview
 * (client-side) and the from-calculator API route (server-side) so the
 * preview always matches what gets persisted.
 */

export interface ScalableItem {
  id?: string;
  description: string;
  unit: string;
  quantity: number | string;
  unitPrice: number | string;
  totalCost?: number | string;
  kind?: string;
  sortOrder?: number;
}

export interface ScalableSection {
  id?: string;
  title: string;
  sortOrder?: number;
  items: ScalableItem[];
}

export interface ScalableReference {
  id?: string;
  title: string;
  totalAreaM2: number | string;
  sections: ScalableSection[];
}

export interface ScaledItem {
  description: string;
  unit: string;
  originalQuantity: number;
  quantity: number;
  unitPrice: number;
  amount: number;
  kind?: string;
  sortOrder: number;
}

export interface ScaledSection {
  title: string;
  sortOrder: number;
  items: ScaledItem[];
  sectionTotal: number;
}

export interface ScaledEstimate {
  scaleFactor: number;
  newAreaM2: number;
  referenceAreaM2: number;
  sections: ScaledSection[];
  grandTotal: number;
  itemCount: number;
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

export function scaleReference(
  reference: ScalableReference,
  newAreaM2: number
): ScaledEstimate {
  const referenceAreaM2 = toNumber(reference.totalAreaM2);
  if (referenceAreaM2 <= 0) {
    throw new Error('Reference estimate has no totalAreaM2');
  }
  if (!Number.isFinite(newAreaM2) || newAreaM2 <= 0) {
    throw new Error('newAreaM2 must be a positive number');
  }

  const scaleFactor = newAreaM2 / referenceAreaM2;
  let grandTotal = 0;
  let itemCount = 0;

  const sections: ScaledSection[] = reference.sections.map((section, sIdx) => {
    let sectionTotal = 0;
    const items: ScaledItem[] = section.items.map((item, iIdx) => {
      const originalQuantity = toNumber(item.quantity);
      const unitPrice = toNumber(item.unitPrice);
      const newQuantity = round(originalQuantity * scaleFactor, 3);
      const amount = round(newQuantity * unitPrice, 2);
      sectionTotal = round(sectionTotal + amount, 2);
      itemCount += 1;
      return {
        description: item.description,
        unit: item.unit,
        originalQuantity,
        quantity: newQuantity,
        unitPrice,
        amount,
        kind: item.kind,
        sortOrder: item.sortOrder ?? iIdx,
      };
    });
    grandTotal = round(grandTotal + sectionTotal, 2);
    return {
      title: section.title,
      sortOrder: section.sortOrder ?? sIdx,
      items,
      sectionTotal,
    };
  });

  return {
    scaleFactor,
    newAreaM2,
    referenceAreaM2,
    sections,
    grandTotal,
    itemCount,
  };
}
