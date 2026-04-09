"use client";

import { use } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { MessageThread } from "@/components/chat/MessageThread";

export default function ChatConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Чат</h1>
      <ChatLayout activeId={conversationId}>
        <MessageThread conversationId={conversationId} />
      </ChatLayout>
    </div>
  );
}
