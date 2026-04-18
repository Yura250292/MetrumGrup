"use client";

import { useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  onSend: (message: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
};

export function AiChatComposer({ onSend, onAbort, isStreaming, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const msg = value.trim();
    if (!msg || isStreaming || disabled) return;
    onSend(msg);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  return (
    <div
      className="flex items-end gap-2 border-t px-4 py-3"
      style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Напишіть повідомлення..."
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--t-border-strong)]"
        style={{
          backgroundColor: T.panelSoft,
          borderColor: T.borderSoft,
          color: T.textPrimary,
        }}
      />
      {isStreaming ? (
        <button
          onClick={onAbort}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors hover:opacity-80"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
          title="Зупинити"
        >
          <Square className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-30"
          style={{
            background: value.trim()
              ? `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`
              : T.panelSoft,
            color: value.trim() ? "#fff" : T.textMuted,
          }}
          title="Надіслати"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
