"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { ToggleGroup } from "./toggle-group";

const OPTIONS = [
  { value: "light", label: "", ariaLabel: "Світла тема", icon: <Sun size={14} /> },
  { value: "dark", label: "", ariaLabel: "Темна тема", icon: <Moon size={14} /> },
  { value: "system", label: "", ariaLabel: "Системна тема", icon: <Monitor size={14} /> },
] as const;

export function ThemeToggle({ size = "sm" }: { size?: "sm" | "md" }) {
  const { mode, setMode } = useTheme();
  return (
    <ToggleGroup
      ariaLabel="Перемикач теми"
      size={size}
      value={mode}
      onValueChange={(v) => setMode(v as "light" | "dark" | "system")}
      options={OPTIONS}
    />
  );
}
