"use client";

import { useEffect, useState, KeyboardEvent } from "react";
import type { StaffUser } from "@/hooks/useChat";
import { UserAvatar } from "@/components/ui/UserAvatar";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адмін",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
};

export function MentionPicker({
  query,
  users,
  onPick,
  onCancel,
}: {
  query: string;
  users: StaffUser[];
  onPick: (user: StaffUser) => void;
  onCancel: () => void;
}) {
  const filtered = users
    .filter((u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 6);
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(filtered.length - 1, a + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[active]) {
          e.preventDefault();
          onPick(filtered[active]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtered, active, onPick, onCancel]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 mb-1 z-30 rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white px-3 py-2 text-xs admin-dark:text-gray-400 admin-light:text-gray-600 shadow-xl">
        Немає збігів
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-1 z-30 w-64 rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white shadow-xl overflow-hidden">
      {filtered.map((u, i) => (
        <button
          type="button"
          key={u.id}
          onClick={() => onPick(u)}
          onMouseEnter={() => setActive(i)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
            i === active
              ? "admin-dark:bg-blue-500/15 admin-light:bg-blue-50"
              : "admin-dark:hover:bg-white/5 admin-light:hover:bg-gray-50"
          }`}
        >
          <UserAvatar src={u.avatar} name={u.name} size={28} gradient="linear-gradient(135deg, #3b82f6, #06b6d4)" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
              {u.name}
            </p>
            <p className="text-[10px] admin-dark:text-gray-400 admin-light:text-gray-600">
              {ROLE_LABELS[u.role] ?? u.role}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
