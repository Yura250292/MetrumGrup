"use client";

export function DrawerBody({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 overflow-y-auto px-3 py-3">{children}</div>;
}
