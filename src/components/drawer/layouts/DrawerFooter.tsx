"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function DrawerFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-10 flex items-center gap-2 px-3 py-2"
      style={{
        backgroundColor: T.panel,
        borderTop: `1px solid ${T.borderSoft}`,
      }}
    >
      {children}
    </div>
  );
}
