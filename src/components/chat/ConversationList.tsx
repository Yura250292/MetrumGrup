"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, MessageSquare, FolderKanban, Calculator } from "lucide-react";
import { useConversations, type ChatConversation } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { NewConversationDialog } from "./NewConversationDialog";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}

function ConversationRow({
  conversation,
  isActive,
}: {
  conversation: ChatConversation;
  isActive: boolean;
}) {
  let title: string;
  let Icon: typeof MessageSquare;
  let avatarGradient: string;

  if (conversation.type === "DM") {
    title = conversation.peer?.name ?? "Видалений користувач";
    Icon = MessageSquare;
    avatarGradient = "bg-gradient-to-br from-blue-500 to-cyan-500";
  } else if (conversation.type === "PROJECT") {
    title = conversation.project?.title ?? conversation.title ?? "Канал проєкту";
    Icon = FolderKanban;
    avatarGradient = "bg-gradient-to-br from-orange-500 to-amber-500";
  } else {
    // ESTIMATE
    title = conversation.estimate
      ? `Кошторис ${conversation.estimate.number}`
      : conversation.title ?? "Канал кошторису";
    Icon = Calculator;
    avatarGradient = "bg-gradient-to-br from-purple-500 to-violet-500";
  }
  const initials = title
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      href={`/admin-v2/chat/${conversation.id}`}
      className={`flex items-start gap-3 px-3 py-3 border-b transition-colors tap-highlight-none`}
      style={{
        borderColor: T.borderSoft,
        backgroundColor: isActive ? T.accentPrimarySoft : "transparent",
      }}
    >
      <div
        className={`relative h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center text-white text-sm font-semibold ${avatarGradient}`}
      >
        {conversation.type === "DM" ? (initials || <Icon className="h-5 w-5" />) : <Icon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className="truncate text-sm font-semibold"
            style={{ color: T.textPrimary }}
          >
            {title}
          </p>
          <span className="text-[11px] flex-shrink-0" style={{ color: T.textMuted }}>
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="truncate text-xs" style={{ color: T.textSecondary }}>
            {conversation.lastMessage?.body ?? "Немає повідомлень"}
          </p>
          {conversation.unreadCount > 0 && (
            <span
              className="flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
            >
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ConversationList({ activeId }: { activeId: string | null }) {
  const { data: conversations, isLoading } = useConversations();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: T.borderSoft }}
      >
        <h2 className="text-sm font-bold" style={{ color: T.textPrimary }}>
          Розмови
        </h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Нова
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading && (
          <p className="p-4 text-sm" style={{ color: T.textMuted }}>
            Завантаження...
          </p>
        )}
        {!isLoading && conversations?.length === 0 && (
          <div className="p-6 text-center">
            <MessageSquare className="mx-auto h-10 w-10" style={{ color: T.textMuted }} />
            <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
              Поки немає розмов. Натисніть "Нова", щоб почати.
            </p>
          </div>
        )}
        {conversations?.map((c) => (
          <ConversationRow key={c.id} conversation={c} isActive={c.id === activeId} />
        ))}
      </div>
      <NewConversationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
