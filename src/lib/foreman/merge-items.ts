import type { ParsedExpense } from "@/lib/ai/parse-expense-text";
import type { CostType } from "@prisma/client";

export interface ForemanDraftItem {
  costType: CostType;
  title: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  currency: string;
  confidence: number | null;
}

function normalizeKey(it: ForemanDraftItem): string {
  return [
    it.costType,
    it.title.toLowerCase().trim().replace(/\s+/g, " "),
    (it.unit ?? "").toLowerCase().trim(),
    it.quantity ?? "",
  ].join("|");
}

/**
 * З'єднує items з різних AI джерел (text + photos + PDF + Excel) і прибирає
 * дублікати за нормалізованим (costType+title+unit+quantity). Якщо знайдено
 * дублікат — зберігаємо item з вищим confidence.
 */
export function mergeForemanItems(sources: ForemanDraftItem[][]): ForemanDraftItem[] {
  const map = new Map<string, ForemanDraftItem>();
  for (const source of sources) {
    for (const item of source) {
      const key = normalizeKey(item);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        continue;
      }
      // Дубль — лишаємо з вищим confidence
      const existingConf = existing.confidence ?? 0;
      const newConf = item.confidence ?? 0;
      if (newConf > existingConf) {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}

export function fromParsedExpense(p: ParsedExpense): ForemanDraftItem {
  return {
    costType: p.costType as CostType,
    title: p.title,
    unit: p.unit ?? null,
    quantity: p.quantity ?? null,
    unitPrice: p.unitPrice ?? null,
    amount: p.amount,
    currency: p.currency || "UAH",
    confidence: p.confidence ?? null,
  };
}
