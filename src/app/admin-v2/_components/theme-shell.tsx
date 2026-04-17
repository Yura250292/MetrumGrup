"use client";

import { ThemeProvider } from "@/contexts/ThemeContext";

export function ThemeShell({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
