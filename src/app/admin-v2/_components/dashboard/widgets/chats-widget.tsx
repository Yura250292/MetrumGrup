"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, ArrowRight, Sparkles } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { chatKeys, type ChatConversation } from "@/hooks/useChat";
import { formatRelativeTime } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

export function ChatsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: async () => {
      const res = await fetch("/api/admin/chat/conversations");
      if (!res.ok) throw new Error("Не вдалося завантажити чати");
      return (await res.json()) as { conversations: ChatConversation[] };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const conversations = (data?.conversations ?? [])
    .slice()
    .sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    })
    .slice(0, 5);

  const totalUnread = (data?.conversations ?? []).reduce((n, c) => n + c.unreadCount, 0);

  return (
    <WidgetShell
      icon={<MessageSquare size={14} />}
      title="Чати"
      subtitle={totalUnread > 0 ? "Нові повідомлення чекають" : "Усе прочитано"}
      badge={totalUnread > 0 ? { label: String(totalUnread), tone: "accent" } : undefined}
      action={{ href: "/admin-v2/chat", label: "Усі" }}
    >
      {isLoading ? (
        <SkeletonList />
      ) : conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {conversations.map((c) => {
            const unread = c.unreadCount > 0;
            const name = displayName(c);
            return (
              <li key={c.id}>
                <Link
                  href={`/admin-v2/chat/${c.id}`}
                  className="group/row flex min-h-[48px] items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 touch-manipulation"
                  style={{
                    backgroundColor: "transparent",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = T.panelElevated;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div className="relative flex-shrink-0">
                    {unread && (
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: `conic-gradient(from 0deg, ${T.accentPrimary}, ${T.accentSecondary}, ${T.accentPrimary})`,
                          padding: 1.5,
                          WebkitMask:
                            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                          WebkitMaskComposite: "xor",
                          maskComposite: "exclude",
                        }}
                      />
                    )}
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold"
                      style={{
                        background: unread
                          ? `linear-gradient(135deg, ${T.accentPrimary}22, ${T.accentSecondary}1A)`
                          : T.panelElevated,
                        color: unread ? T.accentPrimary : T.textMuted,
                        border: unread ? "none" : `1px solid ${T.borderSoft}`,
                        margin: unread ? 2 : 0,
                      }}
                    >
                      {c.peer?.isAi ? <Sparkles size={14} /> : initialOf(name)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="truncate text-[13px] leading-tight tracking-[-0.01em]"
                        style={{
                          color: T.textPrimary,
                          fontWeight: unread ? 700 : 500,
                        }}
                      >
                        {name}
                      </span>
                      {c.lastMessageAt && (
                        <span
                          className="flex-shrink-0 text-[10.5px] tabular-nums"
                          style={{ color: T.textMuted }}
                        >
                          {formatRelativeTime(new Date(c.lastMessageAt))}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span
                        className="truncate text-[11.5px] leading-snug"
                        style={{
                          color: unread ? T.textSecondary : T.textMuted,
                          fontWeight: unread ? 500 : 400,
                        }}
                      >
                        {c.lastMessage?.body?.slice(0, 90) || "Немає повідомлень"}
                      </span>
                      {unread && (
                        <span
                          className="inline-flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums text-white"
                          style={{ backgroundColor: T.accentPrimary }}
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetShell>
  );
}

function displayName(c: ChatConversation): string {
  if (c.title) return c.title;
  if (c.peer) return c.peer.name;
  if (c.project) return c.project.title;
  if (c.estimate) return `Кошторис ${c.estimate.number}`;
  return "Розмова";
}

function initialOf(name: string): string {
  const t = name.trim();
  return t ? t[0].toUpperCase() : "•";
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-11 animate-pulse rounded-xl"
          style={{
            backgroundColor: T.panelElevated,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: `linear-gradient(135deg, ${T.accentPrimary}14, ${T.accentSecondary}14)`,
        }}
      >
        <MessageSquare size={18} style={{ color: T.accentPrimary }} />
      </span>
      <span className="text-[12.5px] font-semibold" style={{ color: T.textPrimary }}>
        Поки тиша
      </span>
      <Link
        href="/admin-v2/chat"
        className="inline-flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: T.accentPrimary }}
      >
        Почати розмову <ArrowRight size={12} />
      </Link>
    </div>
  );
}
