"use client";

import { ConversationList } from "./ConversationList";

export function ChatLayout({
  activeId,
  children,
}: {
  activeId: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
      <div
        className={`${
          activeId ? "hidden md:flex" : "flex"
        } w-full md:w-80 flex-shrink-0 flex-col rounded-xl border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-gray-900/40 admin-light:bg-white overflow-hidden`}
      >
        <ConversationList activeId={activeId} />
      </div>
      <div
        className={`${
          activeId ? "flex" : "hidden md:flex"
        } flex-1 flex-col rounded-xl border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-gray-900/40 admin-light:bg-white overflow-hidden`}
      >
        {children}
      </div>
    </div>
  );
}
