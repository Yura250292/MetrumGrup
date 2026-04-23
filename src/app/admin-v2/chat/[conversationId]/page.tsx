"use client";

import { use } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { MessageThread } from "@/components/chat/MessageThread";

export default function AdminV2ChatConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);

  return (
    <ChatLayout activeId={conversationId}>
      <MessageThread conversationId={conversationId} />
    </ChatLayout>
  );
}
