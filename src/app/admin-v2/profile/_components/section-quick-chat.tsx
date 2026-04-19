"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Plus, X, GripVertical } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useStaffUsers } from "@/hooks/useChat";
import { useQuickContacts, useSaveQuickContacts } from "@/hooks/useQuickContacts";
import { SaveBar } from "./save-bar";

const MAX_CONTACTS = 5;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адмін",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: T.warning,
  MANAGER: T.accentPrimary,
  ENGINEER: T.success,
  FINANCIER: T.warning,
};

export function SectionQuickChat() {
  const { data: allStaff } = useStaffUsers();
  const { data: savedContacts } = useQuickContacts();
  const saveMutation = useSaveQuickContacts();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Init from saved contacts
  useEffect(() => {
    if (savedContacts) {
      setSelectedIds(savedContacts.map((c) => c.id));
    }
  }, [savedContacts]);

  const savedIds = savedContacts?.map((c) => c.id) ?? [];
  const dirty = JSON.stringify(selectedIds) !== JSON.stringify(savedIds);

  const handleAdd = (userId: string) => {
    if (selectedIds.length >= MAX_CONTACTS) return;
    setSelectedIds((prev) => [...prev, userId]);
    setShowPicker(false);
  };

  const handleRemove = (userId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== userId));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setSelectedIds((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await saveMutation.mutateAsync(selectedIds);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedIds(savedIds);
    setError(null);
  };

  // Build selected user objects from allStaff
  const selectedUsers = selectedIds
    .map((id) => allStaff?.find((u) => u.id === id))
    .filter(Boolean) as NonNullable<typeof allStaff>[number][];

  const availableUsers = allStaff?.filter(
    (u) => !selectedIds.includes(u.id),
  ) ?? [];

  return (
    <section
      className="rounded-2xl p-5 md:p-6"
      style={{
        backgroundColor: T.panel,
        border: "1px solid " + T.borderSoft,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <MessageCircle size={16} style={{ color: T.accentPrimary }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Швидкий чат
        </h3>
      </div>
      <p className="text-[13px] mb-4" style={{ color: T.textMuted }}>
        Оберіть до {MAX_CONTACTS} колег для швидкого доступу в хедері. Натисніть на аватарку — і чат відкриється одразу.
      </p>

      {error && (
        <div
          className="rounded-xl px-4 py-2.5 mb-4 text-[13px]"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="rounded-xl px-4 py-2.5 mb-4 text-[13px]"
          style={{ backgroundColor: T.successSoft, color: T.success }}
        >
          Збережено
        </div>
      )}

      {/* Selected contacts list */}
      <div className="flex flex-col gap-2 mb-4">
        {selectedUsers.map((user, i) => (
          <div
            key={user.id}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
          >
            <button
              onClick={() => handleMoveUp(i)}
              className="cursor-grab active:cursor-grabbing p-0.5 rounded"
              style={{ color: T.textMuted }}
              title="Перемістити вгору"
            >
              <GripVertical size={14} />
            </button>
            <UserAvatar src={user.avatar} name={user.name} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: T.textPrimary }}>
                {user.name}
              </p>
              <p className="text-[11px]" style={{ color: ROLE_COLORS[user.role] || T.textMuted }}>
                {ROLE_LABELS[user.role] || user.role}
              </p>
            </div>
            <span
              className="text-[11px] font-medium tabular-nums"
              style={{ color: T.textMuted }}
            >
              {i + 1}
            </span>
            <button
              onClick={() => handleRemove(user.id)}
              className="rounded-lg p-1.5 transition-colors active:scale-95"
              style={{ color: T.danger, backgroundColor: T.dangerSoft }}
              title="Видалити"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {selectedUsers.length === 0 && (
          <div
            className="rounded-xl px-4 py-6 text-center text-[13px]"
            style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
          >
            Поки немає обраних контактів. Додайте колег для швидкого чату.
          </div>
        )}
      </div>

      {/* Add button */}
      {selectedIds.length < MAX_CONTACTS && (
        <div className="relative">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-colors active:scale-95"
            style={{
              color: T.accentPrimary,
              backgroundColor: T.accentPrimarySoft,
              border: `1px dashed ${T.accentPrimary}40`,
            }}
          >
            <Plus size={16} />
            Додати колегу ({selectedIds.length}/{MAX_CONTACTS})
          </button>

          {/* Picker dropdown */}
          {showPicker && availableUsers.length > 0 && (
            <div
              className="absolute left-0 top-full mt-2 w-72 max-h-64 overflow-y-auto rounded-xl py-1.5 shadow-xl z-10"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              {availableUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleAdd(user.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:opacity-80"
                >
                  <UserAvatar src={user.avatar} name={user.name} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: T.textPrimary }}>
                      {user.name}
                    </p>
                    <p className="text-[11px]" style={{ color: T.textMuted }}>
                      {ROLE_LABELS[user.role] || user.role} · {user.email}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} onReset={handleReset} />
    </section>
  );
}
