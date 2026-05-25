"use client";

import { useEffect } from "react";

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useDrawerKeyboard({
  enabled,
  onBack,
}: {
  enabled: boolean;
  onBack: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isTypingTarget(document.activeElement)) return;
        e.preventDefault();
        onBack();
        return;
      }
      if (e.key === "ArrowLeft" && (e.metaKey || e.altKey)) {
        // Не перехоплюємо native Cmd+[/]; ArrowLeft alone — теж не чіпаємо,
        // бо у текстових полях це навігація. Pop тільки на Esc.
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onBack]);
}
