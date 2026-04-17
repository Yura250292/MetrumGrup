"use client";

import { useEffect } from "react";
import { MessageCircle } from "lucide-react";
import {
  useComments,
  usePostComment,
  useMarkCommentsRead,
  type CommentEntityType,
} from "@/hooks/useComments";
import { CommentItem } from "./CommentItem";
import { CommentComposer } from "./CommentComposer";

export function CommentThread({
  entityType,
  entityId,
}: {
  entityType: CommentEntityType;
  entityId: string;
}) {
  const { data: comments, isLoading } = useComments(entityType, entityId);
  const postComment = usePostComment(entityType, entityId);
  const markRead = useMarkCommentsRead(entityType, entityId);

  // Mark comments as read when thread is opened and comments load
  useEffect(() => {
    if (comments && comments.length > 0) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, comments?.length]);

  return (
    <div className="rounded-xl border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-gray-900/40 admin-light:bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 admin-dark:text-gray-400 admin-light:text-gray-600" />
        <h3 className="text-base font-bold admin-dark:text-white admin-light:text-gray-900">
          Обговорення
        </h3>
        {comments && (
          <span className="text-xs admin-dark:text-gray-500 admin-light:text-gray-500">
            ({comments.length})
          </span>
        )}
      </div>

      <div className="space-y-4 mb-4 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
        {isLoading && (
          <p className="text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
            Завантаження...
          </p>
        )}
        {!isLoading && comments?.length === 0 && (
          <div className="py-6 text-center">
            <MessageCircle className="mx-auto h-10 w-10 admin-dark:text-gray-700 admin-light:text-gray-300" />
            <p className="mt-2 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
              Поки немає коментарів. Залиште перший!
            </p>
          </div>
        )}
        {comments?.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            entityType={entityType}
            entityId={entityId}
          />
        ))}
      </div>

      <CommentComposer
        onSubmit={async (body, attachments) => {
          await postComment.mutateAsync(
            attachments ? { body, attachments } : body,
          );
        }}
        isPending={postComment.isPending}
      />
      {postComment.isError && (
        <p className="mt-2 text-xs text-red-500">
          {(postComment.error as Error)?.message}
        </p>
      )}
    </div>
  );
}
