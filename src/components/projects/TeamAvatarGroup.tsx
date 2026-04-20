"use client";

import type { TeamMember } from "@/hooks/useProjectAggregations";
import { UserAvatar } from "@/components/ui/UserAvatar";

const ROLE_GRADIENTS: Record<string, string> = {
  SUPER_ADMIN: "linear-gradient(135deg, #ef4444, #ec4899)",
  MANAGER: "linear-gradient(135deg, #3b82f6, #06b6d4)",
  ENGINEER: "linear-gradient(135deg, #a855f7, #7c3aed)",
  FINANCIER: "linear-gradient(135deg, #10b981, #22c55e)",
  CLIENT: "linear-gradient(135deg, #6b7280, #4b5563)",
  USER: "linear-gradient(135deg, #9ca3af, #6b7280)",
};

export function TeamAvatarGroup({
  users,
  max = 4,
  size = "md",
}: {
  users: TeamMember[];
  max?: number;
  size?: "sm" | "md";
}) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs";

  if (users.length === 0) {
    return (
      <span className="text-xs admin-dark:text-gray-500 admin-light:text-gray-400">
        Команда не призначена
      </span>
    );
  }

  return (
    <div className="flex items-center">
      {visible.map((u, i) => {
        const gradient = ROLE_GRADIENTS[u.role] ?? "linear-gradient(135deg, #6b7280, #4b5563)";
        const sz = size === "sm" ? 24 : 28;
        return (
          <div
            key={u.id}
            title={u.name}
            className={`${i > 0 ? "-ml-2" : ""} border-2 admin-dark:border-gray-900 admin-light:border-white rounded-full`}
          >
            <UserAvatar src={u.avatar} name={u.name} userId={u.id} size={sz} gradient={gradient} />
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className={`${dim} -ml-2 flex-shrink-0 rounded-full admin-dark:bg-gray-700 admin-dark:text-gray-300 admin-light:bg-gray-200 admin-light:text-gray-600 flex items-center justify-center font-semibold border-2 admin-dark:border-gray-900 admin-light:border-white`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
