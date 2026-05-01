import type { CostType, ProjectStage } from "@prisma/client";

/**
 * Phase 4.2 — мапінг етапу на фінансову категорію + costType для derived
 * STAGE_AUTO записів.
 *
 * Замінює старе hardcoded `materials / services` (де "services" взагалі не
 * було у FINANCE_CATEGORIES — invalid value).
 *
 * Якщо стейдж створено з кошторисного item-а і той несе власний `costCodeId/
 * costType` — пріоритет за тими полями (їх юзер обирав свідомо). Інакше —
 * дефолт за `ProjectStage` enum.
 *
 * EXPENSE мапиться на одну з наявних бюджетних категорій. INCOME для всіх
 * стейджів — `client_advance` (єдина ідіоматична INCOME-категорія для
 * платежів від замовника по плану робіт).
 */
export type StageFinanceCategory = {
  category: string;
  costType: CostType | null;
};

export function categorizeStage(args: {
  stage: ProjectStage | null;
  type: "EXPENSE" | "INCOME";
}): StageFinanceCategory {
  if (args.type === "INCOME") {
    return { category: "client_advance", costType: null };
  }
  // EXPENSE
  switch (args.stage) {
    case "DESIGN":
      return { category: "design", costType: "SUBCONTRACT" };
    case "FOUNDATION":
    case "WALLS":
    case "ROOF":
    case "FINISHING":
      return { category: "construction", costType: "MATERIAL" };
    case "ENGINEERING":
      return { category: "construction", costType: "SUBCONTRACT" };
    case "HANDOVER":
      return { category: "admin", costType: "OVERHEAD" };
    default:
      return { category: "construction", costType: null };
  }
}
