"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, UserMinus, UserPlus, X } from "lucide-react";
import {
  useAddParticipants,
  useConversation,
  useRemoveParticipant,
  useStaffUsers,
} from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адмін",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
};

type Mode = "add" | "remove";

export function ManageParticipantsDialog({
  conversationId,
  open,
  initialMode,
  onOpenChange,
}: {
  conversationId: string;
  open: boolean;
  initialMode: Mode;
  onOpenChange: (v: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [query, setQuery] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const { data: conversation } = useConversation(open ? conversationId : null);
  const { data: allUsers } = useStaffUsers();
  const addParticipants = useAddParticipants(conversationId);
  const removeParticipant = useRemoveParticipant(conversationId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setQuery("");
      setSelectedToAdd([]);
      setError(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange]);

  const currentParticipantIds = useMemo(
    () => new Set(conversation?.participants.map((p) => p.user.id) ?? []),
    [conversation],
  );

  const candidates = useMemo(() => {
    if (mode === "add") {
      const list = (allUsers ?? []).filter((u) => !currentParticipantIds.has(u.id));
      const q = query.trim().toLowerCase();
      return q ? list.filter((u) => u.name.toLowerCase().includes(q)) : list;
    }
    const list = conversation?.participants.map((p) => p.user) ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((u) => u.name.toLowerCase().includes(q)) : list;
  }, [mode, allUsers, currentParticipantIds, conversation, query]);

  const toggleSelect = (id: string) => {
    setSelectedToAdd((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleAdd = async () => {
    if (selectedToAdd.length === 0) return;
    setError(null);
    try {
      await addParticipants.mutateAsync(selectedToAdd);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалось додати");
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Видалити «${name}» з розмови?`)) return;
    setError(null);
    try {
      await removeParticipant.mutateAsync(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалось видалити");
    }
  };

  if (!open) return null;

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
          <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Учасники розмови
          </h3>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 transition active:scale-95"
            style={{ color: T.textMuted }}
            aria-label="Закрити"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b" style={{ borderColor: T.borderSoft }}>
          {(
            [
              { id: "add", label: "Додати", icon: UserPlus },
              { id: "remove", label: "Видалити", icon: UserMinus },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMode(tab.id);
                  setQuery("");
                  setSelectedToAdd([]);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium transition"
                style={{
                  color: active ? T.textPrimary : T.textSecondary,
                  borderBottom: active
                    ? `2px solid ${T.accentPrimary}`
                    : "2px solid transparent",
                }}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          className="border-b px-3 py-2"
          style={{ borderColor: T.borderSoft }}
        >
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

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {candidates.length === 0 && (
            <p className="p-6 text-center text-sm" style={{ color: T.textMuted }}>
              {mode === "add" ? "Немає кого додати" : "Немає учасників"}
            </p>
          )}
          {candidates.map((u) => {
            const selected = mode === "add" && selectedToAdd.includes(u.id);
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 px-4 py-3 border-b transition"
                style={{
                  borderColor: T.borderSoft,
                  backgroundColor: selected ? T.accentPrimarySoft : "transparent",
                }}
              >
                <UserAvatar
                  src={u.avatar}
                  name={u.name}
                  size={36}
                  gradient={
                    mode === "add"
                      ? "linear-gradient(135deg, #3b82f6, #06b6d4)"
                      : "linear-gradient(135deg, #ef4444, #f97316)"
                  }
                  nonInteractive
                />
                <div className="text-left min-w-0 flex-1">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {u.name}
                  </p>
                  <p className="text-xs" style={{ color: T.textSecondary }}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </p>
                </div>
                {mode === "add" ? (
                  <button
                    type="button"
                    onClick={() => toggleSelect(u.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: selected ? T.accentPrimary : "transparent",
                      border: `1.5px solid ${selected ? T.accentPrimary : T.borderSoft}`,
                    }}
                    aria-label={selected ? "Зняти вибір" : "Вибрати"}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRemove(u.id, u.name)}
                    disabled={removeParticipant.isPending}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold transition active:scale-95 disabled:opacity-50"
                    style={{
                      color: T.danger,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    Видалити
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div
            className="px-4 py-2 border-t text-xs"
            style={{ borderColor: T.borderSoft, color: T.danger }}
          >
            {error}
          </div>
        )}

        {mode === "add" && (
          <div
            className="px-4 py-3 border-t flex items-center justify-between gap-2"
            style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
          >
            <span className="text-xs" style={{ color: T.textMuted }}>
              Вибрано: {selectedToAdd.length}
            </span>
            <Button
              size="sm"
              disabled={selectedToAdd.length === 0 || addParticipants.isPending}
              onClick={handleAdd}
            >
              {addParticipants.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Додати
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
