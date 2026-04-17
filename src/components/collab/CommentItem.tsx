"use client";

import { useSession } from "next-auth/react";
import { Trash2, FileIcon, Download } from "lucide-react";
import {
  useDeleteComment,
  useToggleCommentReaction,
  type CommentDTO,
  type CommentEntityType,
} from "@/hooks/useComments";
import { ReactionBar } from "./ReactionBar";
import { RenderCommentBody } from "./RenderCommentBody";
import { UserAvatar } from "@/components/ui/UserAvatar";

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
      <UserAvatar
        src={comment.author.avatar}
        name={comment.author.name}
        size={36}
        gradient="linear-gradient(135deg, #a855f7, #7c3aed)"
      />
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
        {comment.body && (
          <div className="mt-0.5 text-sm admin-dark:text-gray-200 admin-light:text-gray-800">
            <RenderCommentBody body={comment.body} mentions={comment.mentions} />
          </div>
        )}
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {comment.attachments.map((att) => {
              const isImage = att.mimeType.startsWith("image/");
              return isImage ? (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg overflow-hidden border admin-dark:border-white/10 admin-light:border-gray-200 hover:opacity-90 transition-opacity"
                >
                  <img
                    src={att.url}
                    alt={att.name}
                    className="max-h-48 max-w-[240px] object-cover"
                  />
                </a>
              ) : (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-gray-800/60 admin-light:bg-gray-50 px-3 py-2 text-xs hover:admin-dark:bg-gray-700/60 hover:admin-light:bg-gray-100 transition-colors"
                >
                  <FileIcon className="h-4 w-4 admin-dark:text-gray-400 admin-light:text-gray-500" />
                  <span className="max-w-[160px] truncate admin-dark:text-gray-300 admin-light:text-gray-700">
                    {att.name}
                  </span>
                  <Download className="h-3.5 w-3.5 admin-dark:text-gray-500 admin-light:text-gray-400" />
                </a>
              );
            })}
          </div>
        )}
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
