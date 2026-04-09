"use client";

import type { TeamMember } from "@/hooks/useProjectAggregations";

const ROLE_GRADIENTS: Record<string, string> = {
  SUPER_ADMIN: "from-red-500 to-pink-500",
  MANAGER: "from-blue-500 to-cyan-500",
  ENGINEER: "from-purple-500 to-violet-500",
  FINANCIER: "from-emerald-500 to-green-500",
  CLIENT: "from-gray-500 to-gray-600",
  USER: "from-gray-400 to-gray-500",
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
        const gradient = ROLE_GRADIENTS[u.role] ?? "from-gray-500 to-gray-600";
        return (
          <div
            key={u.id}
            title={u.name}
            className={`${dim} ${i > 0 ? "-ml-2" : ""} flex-shrink-0 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold border-2 admin-dark:border-gray-900 admin-light:border-white`}
          >
            {u.name?.charAt(0).toUpperCase() ?? "?"}
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
