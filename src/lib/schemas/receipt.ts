import { z } from "zod";

export const ReceiptScanCreateSchema = z.object({
  projectId: z.string().min(1, "projectId required"),
  notes: z.string().max(2000).optional(),
});
export type ReceiptScanCreateInput = z.infer<typeof ReceiptScanCreateSchema>;

export const LineItemEditableFieldsSchema = z.object({
  quantity: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  rawUnit: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export const LineItemMatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("match"),
    materialId: z.string().min(1),
    edits: LineItemEditableFieldsSchema.optional(),
  }),
  z.object({
    action: z.literal("create"),
    newMaterial: z.object({
      name: z.string().min(1).max(200),
      sku: z.string().min(1).max(60),
      category: z.string().min(1).max(80),
      unit: z.string().min(1).max(20),
      basePrice: z.coerce.number().nonnegative(),
    }),
    edits: LineItemEditableFieldsSchema.optional(),
  }),
  z.object({
    action: z.literal("skip"),
  }),
  z.object({
    action: z.literal("edit"),
    edits: LineItemEditableFieldsSchema,
  }),
]);
export type LineItemMatchInput = z.infer<typeof LineItemMatchSchema>;

export const ReceiptRejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const InventoryWriteOffSchema = z.object({
  quantity: z.coerce.number().positive(),
  notes: z.string().max(500).optional(),
  projectId: z.string().min(1).optional(),
});
export type InventoryWriteOffInput = z.infer<typeof InventoryWriteOffSchema>;
