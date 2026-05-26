import { z } from "zod";

const cuid = z.string().cuid();

export const purchaseRequestItemInputSchema = z.object({
  description: z.string().min(2).max(500),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1).max(20),
  costCodeId: cuid.nullable().optional(),
  specifications: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const createPurchaseRequestSchema = z.object({
  projectId: cuid.nullable().optional(),
  neededBy: z.coerce.date().nullable().optional(),
  estimatedBudget: z.coerce.number().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(purchaseRequestItemInputSchema).min(1).max(200),
});

export const updatePurchaseRequestSchema = createPurchaseRequestSchema.partial();

export const sendRfqSchema = z.object({
  counterpartyIds: z.array(cuid).min(1).max(20),
  deadline: z.coerce.date().refine(
    (d) => d.getTime() > Date.now() + 60 * 60 * 1000,
    "deadline must be at least 1h in the future",
  ),
});

export const bidItemInputSchema = z.object({
  purchaseRequestItemId: cuid,
  unitPrice: z.coerce.number().nonnegative(),
  deliveryDate: z.coerce.date().nullable().optional(),
  alternativeOfferDescription: z.string().max(500).nullable().optional(),
  alternativeOfferPrice: z.coerce.number().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const submitBidSchema = z.object({
  items: z.array(bidItemInputSchema).min(1).max(200),
  paymentTerms: z.string().max(300).nullable().optional(),
  deliveryTermsDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  currency: z.enum(["UAH", "USD", "EUR"]).default("UAH"),
});

export const awardBidSchema = z.object({
  bidId: cuid,
  justification: z.string().min(10).max(2000),
});

export const remindRfqSchema = z.object({
  recipientIds: z.array(cuid).optional(),
});

export const confirmDeliverySchema = z.object({
  deliveredAt: z.coerce.date(),
  fullyDelivered: z.boolean(),
  notes: z.string().max(2000).nullable().optional(),
});

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().min(3).max(2000),
});
