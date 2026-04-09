"use client";

import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateConversation } from "@/hooks/useChat";

export function OpenProjectChatButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const createConversation = useCreateConversation();

  const handleClick = async () => {
    try {
      const conversation = await createConversation.mutateAsync({
        type: "PROJECT",
        projectId,
      });
      router.push(`/admin/chat/${conversation.id}`);
    } catch (err) {
      console.error("Failed to open project chat:", err);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={createConversation.isPending}
    >
      <MessageSquare className="h-4 w-4" />
      Обговорити проєкт
    </Button>
  );
}
