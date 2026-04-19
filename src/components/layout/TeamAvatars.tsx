"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useStaffUsers, useCreateConversation } from "@/hooks/useChat";

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "linear-gradient(135deg, #FF8400, #FF6B00)",
  MANAGER: "linear-gradient(135deg, #3B5BFF, #7C5CFF)",
  ENGINEER: "linear-gradient(135deg, #10B981, #059669)",
  FINANCIER: "linear-gradient(135deg, #F59E0B, #D97706)",
};

const ROLE_RING: Record<string, string> = {
  SUPER_ADMIN: "#FF8400",
  MANAGER: "#3B5BFF",
  ENGINEER: "#10B981",
  FINANCIER: "#F59E0B",
};

export function TeamAvatars() {
  const { data: session } = useSession();
  const { data: users } = useStaffUsers();
  const createConversation = useCreateConversation();
  const router = useRouter();

  if (!users || users.length === 0) return null;

  const handleClick = async (userId: string) => {
    try {
      const result = await createConversation.mutateAsync({
        type: "DM",
        userId,
      });
      router.push(`/admin/chat/${result.id}`);
    } catch {
      // conversation creation failed — silently ignore
    }
  };

  // Show max 5 avatars, exclude self
  const visible = users
    .filter((u) => u.id !== session?.user?.id)
    .slice(0, 5);

  return (
    <div className="hidden md:flex items-center gap-0.5">
      {visible.map((user, i) => (
        <button
          key={user.id}
          onClick={() => handleClick(user.id)}
          className="relative rounded-full transition-all hover:scale-110 hover:z-10 active:scale-95"
          style={{
            marginLeft: i > 0 ? -6 : 0,
            outline: `2px solid ${ROLE_RING[user.role] || T.borderSoft}`,
            outlineOffset: 1,
          }}
          title={`Чат з ${user.name}`}
        >
          <UserAvatar
            src={user.avatar}
            name={user.name}
            size={28}
            gradient={ROLE_COLORS[user.role]}
          />
          {/* Online dot */}
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
            style={{
              backgroundColor: "#22C55E",
              borderColor: T.panel,
            }}
          />
        </button>
      ))}
    </div>
  );
}
