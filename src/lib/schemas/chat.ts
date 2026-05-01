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
  z
    .object({
      type: z.literal("GROUP"),
      title: z
        .string()
        .trim()
        .min(1, "Назва обов'язкова")
        .max(120, "Максимум 120 символів"),
      visibility: z.enum(["MEMBERS", "EVERYONE"]).default("MEMBERS"),
      participantIds: z
        .array(z.string().min(1))
        .max(50, "Максимум 50 учасників")
        .default([]),
    })
    .refine(
      (v) => v.visibility === "EVERYONE" || v.participantIds.length >= 1,
      {
        message: "Додайте принаймні одного учасника",
        path: ["participantIds"],
      },
    ),
]);

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const chatAttachmentInputSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  r2Key: z.string().optional(),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024, "Файл перевищує 25 МБ"),
  mimeType: z.string().min(1).max(255),
  durationMs: z.number().int().nonnegative().optional(),
});

export type ChatAttachmentInput = z.infer<typeof chatAttachmentInputSchema>;

export const postMessageSchema = z
  .object({
    body: z
      .string()
      .trim()
      .max(4000, "Максимум 4000 символів")
      .default(""),
    attachments: z.array(chatAttachmentInputSchema).max(10, "Максимум 10 файлів").optional(),
  })
  .refine(
    (v) => (v.body && v.body.length > 0) || (v.attachments && v.attachments.length > 0),
    { message: "Повідомлення або вкладення обов'язкове" }
  );

export type PostMessageInput = z.infer<typeof postMessageSchema>;

export const messageQuerySchema = z.object({
  before: z.string().optional(),
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type MessageQueryInput = z.infer<typeof messageQuerySchema>;
