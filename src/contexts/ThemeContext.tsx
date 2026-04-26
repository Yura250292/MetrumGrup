"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
type ThemeMode = Theme | "system";

interface ThemeContextType {
  /** Resolved theme actually applied (`system` is collapsed to dark/light here). */
  theme: Theme;
  /** User preference: `"light" | "dark" | "system"`. */
  mode: ThemeMode;
  /** Set the user preference. Persists to localStorage (`admin-theme`). */
  setMode: (next: ThemeMode) => void;
  /** Legacy two-state toggle. Switches between dark/light (skips system). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  mode: "system",
  setMode: () => {},
  toggleTheme: () => {},
});

function readSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    const saved = localStorage.getItem("admin-theme");
    if (saved === "dark" || saved === "light" || saved === "system") {
      setModeState(saved);
    }
    setSystemTheme(readSystemTheme());

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: Theme = mode === "system" ? systemTheme : mode;

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin-theme", next);
    }
  };

  const toggleTheme = () => setMode(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
      <div
        className={
          mounted ? (theme === "dark" ? "admin-dark" : "admin-light") : "admin-light"
        }
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
