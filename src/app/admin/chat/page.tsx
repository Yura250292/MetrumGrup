"use client";

import { MessageSquare } from "lucide-react";
import { ChatLayout } from "@/components/chat/ChatLayout";

export default function ChatIndexPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Чат</h1>
      <ChatLayout activeId={null}>
        <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
          <MessageSquare className="h-12 w-12 admin-dark:text-gray-600 admin-light:text-gray-300" />
          <p className="mt-3 text-sm admin-dark:text-gray-400 admin-light:text-gray-600">
            Виберіть розмову зі списку або створіть нову.
          </p>
        </div>
      </ChatLayout>
    </div>
  );
}
