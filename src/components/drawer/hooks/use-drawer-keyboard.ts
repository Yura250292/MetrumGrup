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
  onHistoryBack,
  onHistoryForward,
}: {
  enabled: boolean;
  onBack: () => void;
  onHistoryBack?: () => void;
  onHistoryForward?: () => void;
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
      // Cmd/Ctrl + [ / ] — history nav через browser back/forward.
      // popstate listener у DrillDownDrawerProvider підхопить стек із URL.
      // ArrowLeft alone не біндимо (clash з caret у текстових полях).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (e.key === "[" && onHistoryBack) {
          if (isTypingTarget(document.activeElement)) return;
          e.preventDefault();
          onHistoryBack();
          return;
        }
        if (e.key === "]" && onHistoryForward) {
          if (isTypingTarget(document.activeElement)) return;
          e.preventDefault();
          onHistoryForward();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onBack, onHistoryBack, onHistoryForward]);
}
