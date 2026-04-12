"use client";

import { MessageSquare } from "lucide-react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export default function AdminV2ChatIndexPage() {
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
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Прямі повідомлення, обговорення проєктів та кошторисів
        </p>
      </section>

      {/* Chat shell — wraps existing self-contained ChatLayout */}
      <div
        className="rounded-2xl p-1"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <ChatLayout activeId={null}>
          <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl mb-3"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <MessageSquare size={32} style={{ color: T.accentPrimary }} />
            </div>
            <p
              className="text-[14px] font-semibold"
              style={{ color: T.textPrimary }}
            >
              Виберіть розмову
            </p>
            <p className="text-[12px]" style={{ color: T.textMuted }}>
              Або створіть нову зі списку зліва
            </p>
          </div>
        </ChatLayout>
      </div>
    </div>
  );
}
