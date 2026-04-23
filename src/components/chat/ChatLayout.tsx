"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ConversationList } from "./ConversationList";

export function ChatLayout({
  activeId,
  children,
}: {
  activeId: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100dvh-13rem)] md:h-[calc(100dvh-8rem)] gap-4 overflow-hidden">
      <div
        className={`${
          activeId ? "hidden md:flex" : "flex"
        } w-full md:w-80 flex-shrink-0 flex-col rounded-xl overflow-hidden min-h-0`}
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <ConversationList activeId={activeId} />
      </div>
      <div
        className={`${
          activeId ? "flex" : "hidden md:flex"
        } flex-1 flex-col rounded-xl overflow-hidden min-h-0 min-w-0`}
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
