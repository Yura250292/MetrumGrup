"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, MessageSquare, FolderKanban, Calculator, Users, Check, Globe, Lock } from "lucide-react";
import { useCreateConversation, useStaffUsers } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адмін",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
};

type AdminProject = { id: string; title: string; slug: string };
type AdminEstimate = { id: string; number: string; title: string };

export function NewConversationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"DM" | "PROJECT" | "ESTIMATE" | "GROUP">("DM");
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [estimates, setEstimates] = useState<AdminEstimate[] | null>(null);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [groupVisibility, setGroupVisibility] = useState<"MEMBERS" | "EVERYONE">(
    "MEMBERS",
  );
  const { data: users } = useStaffUsers();
  const createConversation = useCreateConversation();

  useEffect(() => {
    if (!open) {
      setGroupTitle("");
      setGroupMemberIds([]);
      setGroupVisibility("MEMBERS");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || tab !== "PROJECT" || projects) return;
    fetch("/api/admin/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.data ?? []))
      .catch(() => setProjects([]));
  }, [open, tab, projects]);

  useEffect(() => {
    if (!open || tab !== "ESTIMATE" || estimates) return;
    fetch("/api/admin/estimates")
      .then((r) => r.json())
      .then((d) => setEstimates(d.data ?? d.estimates ?? []))
      .catch(() => setEstimates([]));
  }, [open, tab, estimates]);

  if (!open) return null;

  const handleCreate = async (
    input:
      | { type: "DM"; userId: string }
      | { type: "PROJECT"; projectId: string }
      | { type: "ESTIMATE"; estimateId: string }
      | {
          type: "GROUP";
          title: string;
          participantIds: string[];
          visibility?: "MEMBERS" | "EVERYONE";
        }
  ) => {
    try {
      const conversation = await createConversation.mutateAsync(input);
      onOpenChange(false);
      router.push(`/admin-v2/chat/${conversation.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleGroupMember = (userId: string) => {
    setGroupMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const canCreateGroup =
    groupTitle.trim().length > 0 &&
    (groupVisibility === "EVERYONE" || groupMemberIds.length > 0) &&
    !createConversation.isPending;

  const tabItems = [
    { id: "DM" as const, label: "Особиста", icon: MessageSquare },
    { id: "GROUP" as const, label: "Група", icon: Users },
    { id: "PROJECT" as const, label: "Проєкт", icon: FolderKanban },
    { id: "ESTIMATE" as const, label: "Кошторис", icon: Calculator },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-xl"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: T.borderSoft }}
        >
          <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Нова розмова
          </h3>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 transition active:scale-95"
            style={{ color: T.textMuted }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b" style={{ borderColor: T.borderSoft }}>
          {tabItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 text-xs sm:text-sm font-medium"
                style={{
                  color: active ? T.textPrimary : T.textSecondary,
                  borderBottom: active ? `2px solid ${T.accentPrimary}` : "2px solid transparent",
                }}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {tab === "DM" && (
            <div>
              {!users && (
                <p className="p-4 text-sm" style={{ color: T.textMuted }}>
                  Завантаження...
                </p>
              )}
              {users?.length === 0 && (
                <p className="p-4 text-sm" style={{ color: T.textMuted }}>
                  Немає інших співробітників
                </p>
              )}
              {users?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleCreate({ type: "DM", userId: u.id })}
                  disabled={createConversation.isPending}
                  className="flex w-full items-center gap-3 px-4 py-3 border-b transition tap-highlight-none disabled:opacity-50"
                  style={{ borderColor: T.borderSoft }}
                >
                  <UserAvatar src={u.avatar} name={u.name} size={36} gradient="linear-gradient(135deg, #3b82f6, #06b6d4)" nonInteractive />
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: T.textPrimary }}>
                      {u.name}
                    </p>
                    <p className="text-xs" style={{ color: T.textSecondary }}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "GROUP" && (
            <div className="flex flex-col">
              <div className="px-4 py-3 border-b" style={{ borderColor: T.borderSoft }}>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: T.textSecondary }}
                >
                  Назва групи
                </label>
                <input
                  type="text"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value.slice(0, 120))}
                  placeholder="Наприклад: Об'єкт на Гетьмана"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelElevated,
                    border: `1px solid ${T.borderSoft}`,
                    color: T.textPrimary,
                  }}
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: T.textMuted }}>
                  <span>Учасників: {groupMemberIds.length}</span>
                  <span>{groupTitle.length}/120</span>
                </div>
                <div className="mt-3">
                  <label
                    className="block text-xs font-semibold mb-1.5"
                    style={{ color: T.textSecondary }}
                  >
                    Видимість
                  </label>
                  <div
                    className="grid grid-cols-2 gap-2 rounded-lg p-1"
                    style={{
                      backgroundColor: T.panelElevated,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    {(
                      [
                        {
                          id: "MEMBERS" as const,
                          label: "Тільки запрошені",
                          icon: Lock,
                          hint: "Бачать лише обрані учасники",
                        },
                        {
                          id: "EVERYONE" as const,
                          label: "Усі співробітники",
                          icon: Globe,
                          hint: "Публічна — бачать усі staff",
                        },
                      ]
                    ).map((opt) => {
                      const Icon = opt.icon;
                      const active = groupVisibility === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setGroupVisibility(opt.id)}
                          className="flex flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition active:scale-[0.99]"
                          style={{
                            backgroundColor: active ? T.panel : "transparent",
                            border: `1px solid ${active ? T.accentPrimary : "transparent"}`,
                          }}
                          aria-pressed={active}
                        >
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-semibold"
                            style={{
                              color: active ? T.accentPrimary : T.textPrimary,
                            }}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: T.textMuted }}
                          >
                            {opt.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                {!users && (
                  <p className="p-4 text-sm" style={{ color: T.textMuted }}>
                    Завантаження...
                  </p>
                )}
                {users?.length === 0 && (
                  <p className="p-4 text-sm" style={{ color: T.textMuted }}>
                    Немає інших співробітників
                  </p>
                )}
                {users?.map((u) => {
                  const selected = groupMemberIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleGroupMember(u.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 border-b transition tap-highlight-none"
                      style={{
                        borderColor: T.borderSoft,
                        backgroundColor: selected ? T.accentPrimarySoft : "transparent",
                      }}
                    >
                      <UserAvatar src={u.avatar} name={u.name} size={36} gradient="linear-gradient(135deg, #8b5cf6, #ec4899)" nonInteractive />
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate" style={{ color: T.textPrimary }}>
                          {u.name}
                        </p>
                        <p className="text-xs" style={{ color: T.textSecondary }}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </p>
                      </div>
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-md"
                        style={{
                          backgroundColor: selected ? T.accentPrimary : "transparent",
                          border: `1.5px solid ${selected ? T.accentPrimary : T.borderSoft}`,
                        }}
                      >
                        {selected && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div
                className="sticky bottom-0 px-4 py-3 border-t"
                style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
              >
                <Button
                  className="w-full"
                  disabled={!canCreateGroup}
                  onClick={() =>
                    handleCreate({
                      type: "GROUP",
                      title: groupTitle.trim(),
                      participantIds: groupMemberIds,
                      visibility: groupVisibility,
                    })
                  }
                >
                  {createConversation.isPending
                    ? "Створюємо…"
                    : groupVisibility === "EVERYONE"
                      ? "Створити публічну розмову"
                      : "Створити групу"}
                </Button>
              </div>
            </div>
          )}
          {tab === "PROJECT" && (
            <div>
              {!projects && (
                <p className="p-4 text-sm" style={{ color: T.textMuted }}>
                  Завантаження...
                </p>
              )}
              {projects?.length === 0 && (
                <p className="p-4 text-sm" style={{ color: T.textMuted }}>
                  Немає проєктів
                </p>
              )}
              {projects?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleCreate({ type: "PROJECT", projectId: p.id })}
                  disabled={createConversation.isPending}
                  className="flex w-full items-center gap-3 px-4 py-3 border-b transition tap-highlight-none disabled:opacity-50"
                  style={{ borderColor: T.borderSoft }}
                >
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white">
                    <FolderKanban className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: T.textPrimary }}>
                      {p.title}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "ESTIMATE" && (
            <div>
              {!estimates && (
                <p className="p-4 text-sm" style={{ color: T.textMuted }}>
                  Завантаження...
                </p>
              )}
              {estimates?.length === 0 && (
                <p className="p-4 text-sm" style={{ color: T.textMuted }}>
                  Немає кошторисів
                </p>
              )}
              {estimates?.map((est) => (
                <button
                  key={est.id}
                  onClick={() => handleCreate({ type: "ESTIMATE", estimateId: est.id })}
                  disabled={createConversation.isPending}
                  className="flex w-full items-center gap-3 px-4 py-3 border-b transition tap-highlight-none disabled:opacity-50"
                  style={{ borderColor: T.borderSoft }}
                >
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center text-white">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: T.textPrimary }}>
                      {est.number}: {est.title}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {createConversation.isError && (
          <div className="px-4 py-2 border-t" style={{ borderColor: T.borderSoft }}>
            <p className="text-xs text-red-500">
              {(createConversation.error as Error)?.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
