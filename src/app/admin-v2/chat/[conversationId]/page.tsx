"use client";

import { use } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { MessageThread } from "@/components/chat/MessageThread";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export default function AdminV2ChatConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span
          className="text-[11px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          КОМАНДНЕ СПІЛКУВАННЯ
        </span>
        <h1
          className="text-3xl md:text-4xl font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          Чат
        </h1>
      </section>

      <div
        className="rounded-2xl p-1"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <ChatLayout activeId={conversationId}>
          <MessageThread conversationId={conversationId} />
        </ChatLayout>
      </div>
    </div>
  );
}
