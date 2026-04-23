import { z } from "zod";

export const createConversationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("DM"),
    userId: z.string().min(1),
  }),
  z.object({
    type: z.literal("PROJECT"),
    projectId: z.string().min(1),
  }),
  z.object({
    type: z.literal("ESTIMATE"),
    estimateId: z.string().min(1),
  }),
  z.object({
    type: z.literal("GROUP"),
    title: z.string().trim().min(1, "Назва обов'язкова").max(120, "Максимум 120 символів"),
    participantIds: z
      .array(z.string().min(1))
      .min(1, "Додайте принаймні одного учасника")
      .max(50, "Максимум 50 учасників"),
  }),
]);

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const postMessageSchema = z.object({
  body: z.string().trim().min(1, "Повідомлення не може бути порожнім").max(4000, "Максимум 4000 символів"),
});

export type PostMessageInput = z.infer<typeof postMessageSchema>;

export const messageQuerySchema = z.object({
  before: z.string().optional(),
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type MessageQueryInput = z.infer<typeof messageQuerySchema>;
