"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Search, Sparkles, X } from "lucide-react";
import { useConversation } from "@/hooks/useChat";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адмін",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
  HR: "HR",
  USER: "Користувач",
  CLIENT: "Клієнт",
};

export function ChatParticipantsDialog({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: conversation } = useConversation(open ? conversationId : null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange]);

  const participants = useMemo(() => {
    const list = conversation?.participants.map((p) => p.user) ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((u) => u.name.toLowerCase().includes(q)) : list;
  }, [conversation, query]);

  if (!open) return null;

  const isPublic = conversation?.visibility === "EVERYONE";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-xl flex flex-col max-h-[80vh]"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: T.borderSoft }}
        >
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
              Учасники
            </h3>
            <p className="text-[11px]" style={{ color: T.textMuted }}>
              {conversation
                ? `${conversation.participants.length} ${pluralize(conversation.participants.length)}`
                : "Завантаження…"}
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 transition active:scale-95"
            style={{ color: T.textMuted }}
            aria-label="Закрити"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isPublic && (
          <div
            className="flex items-start gap-2 border-b px-4 py-2.5"
            style={{
              borderColor: T.borderSoft,
              backgroundColor: T.accentPrimarySoft,
            }}
          >
            <Globe
              className="h-4 w-4 flex-shrink-0 mt-0.5"
              style={{ color: T.accentPrimary }}
            />
            <p className="text-xs" style={{ color: T.textPrimary }}>
              Публічна розмова — її бачать усі співробітники. Нижче лише ті, хто
              вже взаємодіяв із чатом.
            </p>
          </div>
        )}

        {(conversation?.participants.length ?? 0) > 6 && (
          <div className="border-b px-3 py-2" style={{ borderColor: T.borderSoft }}>
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <Search className="h-4 w-4" style={{ color: T.textMuted }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук за імʼям"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: T.textPrimary }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {participants.length === 0 && (
            <p className="p-6 text-center text-sm" style={{ color: T.textMuted }}>
              {query ? "Нічого не знайдено" : "Поки немає учасників"}
            </p>
          )}
          {participants.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b"
              style={{ borderColor: T.borderSoft }}
            >
              {u.isAi ? (
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundImage: "linear-gradient(135deg, #f97316, #ec4899)" }}
                  title="AI асистент"
                >
                  <Sparkles className="h-4 w-4" style={{ color: "#FFFFFF" }} />
                </div>
              ) : (
                <UserAvatar
                  src={u.avatar}
                  name={u.name}
                  userId={u.id}
                  size={36}
                  gradient="linear-gradient(135deg, #a855f7, #7c3aed)"
                  nonInteractive
                />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: T.textPrimary }}
                >
                  {u.name}
                </p>
                <p className="text-xs truncate" style={{ color: T.textSecondary }}>
                  {u.isAi ? "AI асистент" : ROLE_LABELS[u.role] ?? u.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function pluralize(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "учасник";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "учасники";
  return "учасників";
}
