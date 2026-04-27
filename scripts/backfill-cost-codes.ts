/**
 * Backfill costCodeId + costType on FinanceEntry and EstimateItem.
 *
 * SAFE TO RE-RUN: only writes when both fields are NULL. Never overwrites
 * values set by humans. Existing `category` (FinanceEntry) and `itemType`
 * (EstimateItem) are not modified.
 *
 * Mapping rules below are intentionally conservative — uncertain cases stay
 * NULL, so operators can set them explicitly later.
 *
 * Run: pnpm tsx scripts/backfill-cost-codes.ts
 */
import { PrismaClient, CostType } from "@prisma/client";
import { mapItemToFinanceCategory } from "../src/lib/financing/estimate-mapping";

const prisma = new PrismaClient();

// FinanceEntry.category → { costCode (by code), costType }.
// `null` for either field means "leave NULL".
const CATEGORY_MAP: Record<string, { code: string | null; type: CostType | null }> = {
  materials:      { code: null,   type: "MATERIAL"    }, // root cost code is too generic — let UI assign
  subcontractors: { code: null,   type: "SUBCONTRACT" },
  salary:         { code: null,   type: "LABOR"       },
  rent:           { code: "08.3", type: "EQUIPMENT"   },
  equipment:      { code: "08.3", type: "EQUIPMENT"   },
  logistics:      { code: "08.2", type: "OVERHEAD"    },
  design:         { code: "08.1", type: "OVERHEAD"    },
  demolition:     { code: "01.1", type: "LABOR"       },
  construction:   { code: null,   type: null          }, // too vague — let UI assign
  admin:          { code: "08.4", type: "OVERHEAD"    },
  utilities:      { code: "08.4", type: "OVERHEAD"    },
  taxes:          { code: "09",   type: "OVERHEAD"    },
  other_expense:  { code: null,   type: "OTHER"       },
  // INCOME categories — no cost-code, no costType
  investment:     { code: null,   type: null          },
  client_advance: { code: null,   type: null          },
  other_income:   { code: null,   type: null          },
};

// EstimateItem.itemType → costType. costCode is left NULL; backfill from
// section title is much weaker signal — leave for human.
const ITEM_TYPE_TO_COST_TYPE: Record<string, CostType> = {
  material:  "MATERIAL",
  labor:     "LABOR",
  equipment: "EQUIPMENT",
  // 'composite' → null
};

async function main() {
  console.log("🔄 Backfilling cost-codes…");

  // Build code → id lookup.
  const codes = await prisma.costCode.findMany({ select: { id: true, code: true } });
  const codeToId = new Map(codes.map((c) => [c.code, c.id]));
  if (codes.length === 0) {
    console.error("❌ cost_codes table is empty — run scripts/seed-cost-codes.ts first.");
    process.exit(1);
  }

  // ----- FinanceEntry -----
  const entries = await prisma.financeEntry.findMany({
    where: { costCodeId: null, costType: null },
    select: { id: true, category: true },
  });
  console.log(`  FinanceEntry candidates: ${entries.length}`);

  let feUpdated = 0;
  let feSkipped = 0;
  for (const e of entries) {
    const m = CATEGORY_MAP[e.category];
    if (!m || (m.code === null && m.type === null)) {
      feSkipped++;
      continue;
    }
    const data: { costCodeId?: string; costType?: CostType } = {};
    if (m.code) {
      const id = codeToId.get(m.code);
      if (id) data.costCodeId = id;
    }
    if (m.type) data.costType = m.type;

    if (Object.keys(data).length === 0) {
      feSkipped++;
      continue;
    }

    await prisma.financeEntry.update({ where: { id: e.id }, data });
    feUpdated++;
  }
  console.log(`  FinanceEntry: updated ${feUpdated}, skipped ${feSkipped}`);

  // ----- EstimateItem -----
  const items = await prisma.estimateItem.findMany({
    where: { costCodeId: null, costType: null },
    select: {
      id: true,
      itemType: true,
      description: true,
      section: { select: { title: true } },
    },
  });
  console.log(`  EstimateItem candidates: ${items.length}`);

  let eiUpdated = 0;
  let eiSkipped = 0;
  for (const item of items) {
    const data: { costCodeId?: string; costType?: CostType } = {};

    // Direct: itemType wins.
    if (item.itemType) {
      const t = ITEM_TYPE_TO_COST_TYPE[item.itemType];
      if (t) data.costType = t;
    }

    // Indirect: derive financeCategory from itemType + section title, then
    // run it through CATEGORY_MAP. Provides legacy estimates a hint without
    // overwriting anything.
    if (!data.costType || !data.costCodeId) {
      const cat = mapItemToFinanceCategory(
        { itemType: item.itemType, description: item.description },
        item.section,
      );
      const m = CATEGORY_MAP[cat];
      if (m) {
        if (m.code && !data.costCodeId) {
          const id = codeToId.get(m.code);
          if (id) data.costCodeId = id;
        }
        if (m.type && !data.costType) data.costType = m.type;
      }
    }

    if (Object.keys(data).length === 0) {
      eiSkipped++;
      continue;
    }
    await prisma.estimateItem.update({ where: { id: item.id }, data });
    eiUpdated++;
  }
  console.log(`  EstimateItem: updated ${eiUpdated}, skipped ${eiSkipped}`);

  console.log("✅ done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
