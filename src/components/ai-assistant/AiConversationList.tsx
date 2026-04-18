"use client";

import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiConversations, useDeleteAiConversation, type AiConversationItem } from "@/hooks/useAiChat";

type Props = {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function AiConversationList({ activeId, onSelect, onNew }: Props) {
  const { data: conversations, isLoading } = useAiConversations();
  const deleteMutation = useDeleteAiConversation();

  return (
    <div className="flex flex-col gap-1 overflow-y-auto px-2 py-2">
      <button
        onClick={onNew}
        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
        style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
      >
        <Plus className="h-4 w-4" />
        Нова розмова
      </button>

      {isLoading && (
        <p className="px-3 py-4 text-center text-xs" style={{ color: T.textMuted }}>
          Завантаження...
        </p>
      )}

      {conversations?.map((conv) => (
        <ConversationRow
          key={conv.id}
          conv={conv}
          isActive={conv.id === activeId}
          onSelect={() => onSelect(conv.id)}
          onDelete={() => {
            if (confirm("Видалити цю розмову?")) {
              deleteMutation.mutate(conv.id);
            }
          }}
        />
      ))}

      {!isLoading && conversations?.length === 0 && (
        <p className="px-3 py-4 text-center text-xs" style={{ color: T.textMuted }}>
          Ще немає розмов
        </p>
      )}
    </div>
  );
}

function ConversationRow({
  conv,
  isActive,
  onSelect,
  onDelete,
}: {
  conv: AiConversationItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive ? "font-medium" : ""
      }`}
      style={{
        backgroundColor: isActive ? T.accentPrimarySoft : "transparent",
        color: isActive ? T.accentPrimary : T.textSecondary,
      }}
      onClick={onSelect}
    >
      <MessageSquare className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{conv.title || "Нова розмова"}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="hidden shrink-0 rounded p-1 transition-colors hover:opacity-80 group-hover:block"
        style={{ color: T.danger }}
        title="Видалити"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
