"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * Каркас вмісту drawer'а: header (sticky) + toolbar (optional sticky) + body
 * (scroll) + footer (sticky). Заповнює всю висоту контейнера drawer'а.
 *
 * Renderer (TaskDrawerContent, тощо) рендерить:
 *   <DrawerLayout>
 *     <DrawerHeader ... />
 *     <DrawerToolbar>...</DrawerToolbar>   // optional
 *     <DrawerBody>...</DrawerBody>
 *     <DrawerFooter>...</DrawerFooter>     // optional
 *   </DrawerLayout>
 */
export function DrawerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: T.panel, color: T.textPrimary }}
    >
      {children}
    </div>
  );
}
