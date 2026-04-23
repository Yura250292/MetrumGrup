"use client";

import { MessageSquare } from "lucide-react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export default function AdminV2ChatIndexPage() {
  return (
    <ChatLayout activeId={null}>
      <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl mb-3"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <MessageSquare size={32} style={{ color: T.accentPrimary }} />
        </div>
        <p className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
          Виберіть розмову
        </p>
        <p className="text-[12px]" style={{ color: T.textMuted }}>
          Або створіть нову зі списку зліва
        </p>
      </div>
    </ChatLayout>
  );
}
