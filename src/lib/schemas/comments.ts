import { z } from "zod";
import { ALLOWED_REACTIONS } from "@/lib/comments/service";

export const commentEntityTypeSchema = z.enum(["ESTIMATE", "PROJECT"]);
export type CommentEntityTypeInput = z.infer<typeof commentEntityTypeSchema>;

export const listCommentsQuerySchema = z.object({
  entityType: commentEntityTypeSchema,
  entityId: z.string().min(1),
});

export const postCommentSchema = z.object({
  entityType: commentEntityTypeSchema,
  entityId: z.string().min(1),
  body: z.string().trim().min(1, "Коментар не може бути порожнім").max(4000, "Максимум 4000 символів"),
});

export const reactionSchema = z.object({
  emoji: z.enum(ALLOWED_REACTIONS),
});
