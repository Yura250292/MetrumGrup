import { z } from "zod";

/**
 * Strict Zod schema for the JSON shape that AI estimate generators
 * (Gemini / OpenAI / Anthropic — all 3 modes + master/multi-agent) return.
 *
 * Use this at the parse boundary BEFORE running the rule-based validators
 * so the rest of the pipeline can rely on numeric/non-empty invariants
 * instead of `any` + ad-hoc checks.
 *
 * Shape mirrors `EstimateItem` / `EstimateSection` in `lib/agents/base-agent.ts`
 * — keep them in sync. Adding a field here is cheap; removing one will
 * silently break the AI flow (the parser will reject existing model output).
 *
 * The schema is intentionally permissive on the *input* side (coercions and
 * defaults absorb the slop) and strict on the *output* side (callers always
 * see numbers where numbers belong).
 */

const numberish = z.union([
  z.number(),
  z.string().transform((s, ctx) => {
    const cleaned = s.replace(/[^\d.\-,]/g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `not a number: ${s}` });
      return z.NEVER;
    }
    return n;
  }),
]);

const nonNegativeNumber = numberish.pipe(z.number().nonnegative());
const positiveNumber = numberish.pipe(z.number().positive());

export const aiEstimateItemSchema = z.object({
  description: z.string().min(1, "description is required"),
  quantity: nonNegativeNumber,
  unit: z.string().min(1).default("шт"),
  unitPrice: nonNegativeNumber,
  laborCost: nonNegativeNumber.default(0),
  totalCost: nonNegativeNumber.optional(),
  priceSource: z.string().optional(),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.5),
  notes: z.string().optional(),
  itemType: z.enum(["material", "labor", "equipment", "composite"]).optional(),
  engineKey: z.string().optional(),
  quantityFormula: z.string().optional(),
  priceSourceType: z
    .enum(["catalog", "prozorro", "scrape", "llm", "manual"])
    .optional(),
});

export const aiEstimateSectionSchema = z.object({
  title: z.string().min(1, "section title is required"),
  items: z.array(aiEstimateItemSchema).default([]),
  sectionTotal: nonNegativeNumber.optional(),
});

export const aiEstimateSchema = z.object({
  title: z.string().min(1).optional(),
  sections: z.array(aiEstimateSectionSchema).min(1, "at least one section required"),
  summary: z
    .object({
      materialsCost: nonNegativeNumber.optional(),
      laborCost: nonNegativeNumber.optional(),
      totalBeforeDiscount: nonNegativeNumber.optional(),
    })
    .optional(),
  validationIssues: z.array(z.unknown()).optional(),
  analysisSummary: z.string().optional(),
});

export type AiEstimateItem = z.infer<typeof aiEstimateItemSchema>;
export type AiEstimateSection = z.infer<typeof aiEstimateSectionSchema>;
export type AiEstimate = z.infer<typeof aiEstimateSchema>;

export type ParseResult =
  | { ok: true; estimate: AiEstimate; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Permissive parse: accepts anything Zod can coerce. Logs (but does not
 * fail on) optional-field violations — only required fields must be valid.
 * Recomputes `totalCost` if missing or off by >1₴.
 */
export function parseAiEstimate(raw: unknown): ParseResult {
  const result = aiEstimateSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`),
    };
  }

  const warnings: string[] = [];
  for (const section of result.data.sections) {
    let computedSectionTotal = 0;
    for (const item of section.items) {
      const expected = item.quantity * item.unitPrice + item.laborCost;
      if (item.totalCost === undefined) {
        item.totalCost = expected;
      } else if (Math.abs(item.totalCost - expected) > 1) {
        warnings.push(
          `Section "${section.title}" item "${item.description}": totalCost ${item.totalCost} ≠ q*p+l ${expected}, recomputing`
        );
        item.totalCost = expected;
      }
      computedSectionTotal += item.totalCost;
    }
    if (section.sectionTotal === undefined || Math.abs(section.sectionTotal - computedSectionTotal) > 1) {
      section.sectionTotal = computedSectionTotal;
    }
  }

  return { ok: true, estimate: result.data, warnings };
}
