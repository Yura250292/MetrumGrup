"use client";

import { useState, useRef, useEffect } from "react";
import { SmilePlus } from "lucide-react";

export type ReactionGroup = {
  emoji: string;
  count: number;
  users: { id: string; name: string }[];
  reactedByMe: boolean;
};

export const ALLOWED_REACTIONS = ["👍", "❤️", "✅", "⚠️", "💯", "👀"] as const;

export function ReactionBar({
  reactions,
  onToggle,
  size = "md",
}: {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
  size?: "sm" | "md";
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  const chipSize = size === "sm" ? "h-6 px-1.5 text-[11px]" : "h-7 px-2 text-xs";

  return (
    <div ref={containerRef} className="relative inline-flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          title={r.users.map((u) => u.name).join(", ")}
          className={`inline-flex items-center gap-1 rounded-full border transition-colors ${chipSize} ${
            r.reactedByMe
              ? "border-blue-500 admin-dark:bg-blue-500/15 admin-light:bg-blue-50 admin-dark:text-blue-200 admin-light:text-blue-700"
              : "admin-dark:border-white/10 admin-dark:bg-white/5 admin-dark:text-gray-300 admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-700"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-semibold">{r.count}</span>
        </button>
      ))}

      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className={`inline-flex items-center justify-center rounded-full border admin-dark:border-white/10 admin-dark:bg-white/5 admin-dark:text-gray-400 admin-dark:hover:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-500 admin-light:hover:text-gray-900 transition-colors ${chipSize}`}
        title="Додати реакцію"
      >
        <SmilePlus className="h-3.5 w-3.5" />
      </button>

      {pickerOpen && (
        <div className="absolute bottom-full left-0 mb-1 z-20 flex gap-1 rounded-xl border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white p-1.5 shadow-xl">
          {ALLOWED_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onToggle(emoji);
                setPickerOpen(false);
              }}
              className="h-8 w-8 rounded-lg text-lg hover:scale-125 transition-transform admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
