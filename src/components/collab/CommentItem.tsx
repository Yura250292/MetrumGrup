"use client";

import { useSession } from "next-auth/react";
import { Trash2 } from "lucide-react";
import {
  useDeleteComment,
  useToggleCommentReaction,
  type CommentDTO,
  type CommentEntityType,
} from "@/hooks/useComments";
import { ReactionBar } from "./ReactionBar";
import { RenderCommentBody } from "./RenderCommentBody";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адмін",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
};

const ADMIN_ROLES = ["SUPER_ADMIN", "MANAGER"];

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommentItem({
  comment,
  entityType,
  entityId,
}: {
  comment: CommentDTO;
  entityType: CommentEntityType;
  entityId: string;
}) {
  const { data: session } = useSession();
  const toggleReaction = useToggleCommentReaction(entityType, entityId);
  const deleteComment = useDeleteComment(entityType, entityId);

  const currentUserId = session?.user?.id;
  const currentRole = session?.user?.role;
  const canDelete =
    currentUserId === comment.author.id ||
    (currentRole && ADMIN_ROLES.includes(currentRole));

  return (
    <div className="flex gap-3 group">
      <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold">
        {comment.author.name?.charAt(0).toUpperCase() ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold admin-dark:text-white admin-light:text-gray-900">
            {comment.author.name}
          </span>
          <span className="text-[10px] admin-dark:text-gray-500 admin-light:text-gray-500">
            {ROLE_LABELS[comment.author.role] ?? comment.author.role}
          </span>
          <span className="text-[10px] admin-dark:text-gray-500 admin-light:text-gray-500">
            • {formatStamp(comment.createdAt)}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Видалити коментар?")) {
                  deleteComment.mutate(comment.id);
                }
              }}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
              title="Видалити"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </button>
          )}
        </div>
        <div className="mt-0.5 text-sm admin-dark:text-gray-200 admin-light:text-gray-800">
          <RenderCommentBody body={comment.body} mentions={comment.mentions} />
        </div>
        <div className="mt-1.5">
          <ReactionBar
            reactions={comment.reactions}
            onToggle={(emoji) =>
              toggleReaction.mutate({ commentId: comment.id, emoji })
            }
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
