"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Calculator, FolderKanban, MessageSquare } from "lucide-react";
import {
  useConversation,
  useMarkRead,
  useMessages,
  useToggleMessageReaction,
  type ChatMessage,
} from "@/hooks/useChat";
import { MessageComposer } from "./MessageComposer";
import { ReactionBar } from "@/components/collab/ReactionBar";
import { RenderCommentBody } from "@/components/collab/RenderCommentBody";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";

function formatStamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({
  message,
  isOwn,
  onToggleReaction,
}: {
  message: ChatMessage;
  isOwn: boolean;
  onToggleReaction: (emoji: string) => void;
}) {
  return (
    <div className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
      <UserAvatar
        src={message.author.avatar}
        name={message.author.name}
        size={32}
        gradient={isOwn
          ? "linear-gradient(135deg, #3b82f6, #06b6d4)"
          : "linear-gradient(135deg, #a855f7, #7c3aed)"}
      />
      <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <span className="text-[11px] mb-0.5" style={{ color: T.textSecondary }}>
            {message.author.name}
          </span>
        )}
        <div
          className="rounded-2xl px-3 py-2 text-sm break-words"
          style={
            isOwn
              ? { backgroundColor: T.accentPrimary, color: "#FFFFFF" }
              : { backgroundColor: T.panelElevated, color: T.textPrimary }
          }
        >
          <RenderCommentBody body={message.body} mentions={[]} />
        </div>
        <span className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
          {formatStamp(message.createdAt)}
        </span>
        <div className="mt-1">
          <ReactionBar
            reactions={message.reactions ?? []}
            onToggle={onToggleReaction}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

export function MessageThread({ conversationId }: { conversationId: string }) {
  const { data: session } = useSession();
  const { data: conversation } = useConversation(conversationId);
  const { data: messagesData, isLoading } = useMessages(conversationId);
  const markRead = useMarkRead(conversationId);
  const toggleReaction = useToggleMessageReaction(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastReadCountRef = useRef(0);

  const messages = messagesData?.messages ?? [];

  // Auto-scroll to bottom when messages change (only if user is near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isNearBottom || lastReadCountRef.current === 0) {
      el.scrollTop = el.scrollHeight;
    }
    lastReadCountRef.current = messages.length;
  }, [messages.length]);

  // Mark read on mount and when new messages arrive
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length]);

  const currentUserId = session?.user?.id;

  let title = "Розмова";
  let Icon = MessageSquare;
  let subtitleHref: string | null = null;
  let subtitleText: string | null = null;

  if (conversation?.type === "DM") {
    title = conversation.peer?.name ?? "Розмова";
    Icon = MessageSquare;
  } else if (conversation?.type === "PROJECT") {
    title = conversation.project?.title ?? conversation.title ?? "Канал проєкту";
    Icon = FolderKanban;
    if (conversation.project) {
      subtitleHref = `/admin-v2/projects/${conversation.project.id}`;
      subtitleText = "Відкрити проєкт \u2192";
    }
  } else if (conversation?.type === "ESTIMATE") {
    title = conversation.estimate
      ? `Кошторис ${conversation.estimate.number}: ${conversation.estimate.title}`
      : conversation.title ?? "Канал кошторису";
    Icon = Calculator;
    if (conversation.estimate) {
      subtitleHref = `/admin-v2/estimates/${conversation.estimate.id}`;
      subtitleText = "Відкрити кошторис \u2192";
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: T.borderSoft }}
      >
        <Link
          href="/admin-v2/chat"
          className="md:hidden rounded-lg p-1 transition active:scale-95 tap-highlight-none"
          style={{ color: T.textSecondary }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Icon className="h-5 w-5" style={{ color: T.textSecondary }} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: T.textPrimary }}>
            {title}
          </p>
          {subtitleHref && subtitleText && (
            <Link
              href={subtitleHref}
              className="text-[11px] hover:underline"
              style={{ color: T.accentPrimary }}
            >
              {subtitleText}
            </Link>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3"
      >
        {isLoading && (
          <p className="text-center text-sm" style={{ color: T.textMuted }}>
            Завантаження...
          </p>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-center text-sm" style={{ color: T.textMuted }}>
            Поки немає повідомлень. Напишіть перше!
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.authorId === currentUserId}
            onToggleReaction={(emoji) =>
              toggleReaction.mutate({ messageId: m.id, emoji })
            }
          />
        ))}
      </div>

      {/* Composer */}
      <MessageComposer conversationId={conversationId} />
    </div>
  );
}
