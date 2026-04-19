"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useStaffUsers, useCreateConversation } from "@/hooks/useChat";
import { useQuickContacts } from "@/hooks/useQuickContacts";

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
  const { data: quickContacts } = useQuickContacts();
  const { data: allStaff } = useStaffUsers();
  const createConversation = useCreateConversation();
  const router = useRouter();

  // Use configured contacts, or fall back to all colleagues (max 5)
  const contacts = quickContacts && quickContacts.length > 0
    ? quickContacts
    : allStaff
      ?.filter((u) => u.id !== session?.user?.id)
      .slice(0, 5)
      .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, role: u.role }))
    ?? [];

  if (contacts.length === 0) return null;

  const handleClick = async (userId: string) => {
    try {
      const result = await createConversation.mutateAsync({
        type: "DM",
        userId,
      });
      router.push(`/admin/chat/${result.id}`);
    } catch {
      // conversation creation failed
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      {contacts.map((user, i) => (
        <button
          key={user.id}
          onClick={() => handleClick(user.id)}
          className="relative rounded-full transition-all hover:scale-110 hover:z-10 active:scale-95 tap-highlight-none"
          style={{
            marginLeft: i > 0 ? -4 : 0,
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
        </button>
      ))}
    </div>
  );
}
