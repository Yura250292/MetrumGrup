"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative flex items-center justify-center w-14 h-7 rounded-full transition-all duration-300",
        theme === "dark"
          ? "bg-gradient-to-r from-blue-600 to-purple-600"
          : "bg-gradient-to-r from-amber-400 to-orange-500",
        className
      )}
      title={theme === "dark" ? "Переключити на світлу тему" : "Переключити на темну тему"}
    >
      {/* Slider */}
      <div
        className={cn(
          "absolute w-5 h-5 rounded-full bg-white shadow-lg transition-transform duration-300 flex items-center justify-center",
          theme === "dark" ? "translate-x-[-10px]" : "translate-x-[10px]"
        )}
      >
        {theme === "dark" ? (
          <Moon className="w-3 h-3 text-blue-600" />
        ) : (
          <Sun className="w-3 h-3 text-orange-500" />
        )}
      </div>
    </button>
  );
}
