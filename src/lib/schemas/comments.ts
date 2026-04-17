import { z } from "zod";
import { ALLOWED_REACTIONS } from "@/lib/comments/service";

export const commentEntityTypeSchema = z.enum(["ESTIMATE", "PROJECT", "TASK"]);
export type CommentEntityTypeInput = z.infer<typeof commentEntityTypeSchema>;

export const listCommentsQuerySchema = z.object({
  entityType: commentEntityTypeSchema,
  entityId: z.string().min(1),
});

export const attachmentInputSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  r2Key: z.string().optional(),
  size: z.number().int().positive(),
  mimeType: z.string().min(1),
});

export const postCommentSchema = z.object({
  entityType: commentEntityTypeSchema,
  entityId: z.string().min(1),
  body: z.string().trim().max(4000, "Максимум 4000 символів").default(""),
  attachments: z.array(attachmentInputSchema).max(10).optional(),
}).refine(
  (data) => data.body.length > 0 || (data.attachments && data.attachments.length > 0),
  { message: "Коментар або файл обов'язковий" },
);

export const reactionSchema = z.object({
  emoji: z.enum(ALLOWED_REACTIONS),
});
