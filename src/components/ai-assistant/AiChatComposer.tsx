"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Mic, MicOff } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  onSend: (message: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
};

export function AiChatComposer({ onSend, onAbort, isStreaming, disabled }: Props) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
  const hasSpeechSupport = !!(w && (w.SpeechRecognition || w.webkitSpeechRecognition));

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

  // Auto-resize when value changes (e.g. from voice input)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [value]);

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (win.SpeechRecognition ?? win.webkitSpeechRecognition) as any;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "uk-UA";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: { results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setValue((prev) => {
        // Replace interim with final
        const base = prev.replace(/\[.*?\]$/, "").trim();
        if (event.results[event.results.length - 1].isFinal) {
          return base ? `${base} ${transcript}` : transcript;
        }
        return base ? `${base} [${transcript}]` : `[${transcript}]`;
      });
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [isListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <div
      className="flex shrink-0 items-end gap-1.5 md:gap-2 border-t px-3 py-2.5 md:px-4 md:py-3 safe-area-pb"
      style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
    >
      {/* Voice button */}
      {hasSpeechSupport && (
        <button
          onClick={toggleVoice}
          disabled={isStreaming || disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 tap-highlight-none disabled:opacity-30"
          style={{
            backgroundColor: isListening ? T.dangerSoft : T.panelElevated,
            color: isListening ? T.danger : T.textSecondary,
          }}
          title={isListening ? "Зупинити запис" : "Голосовий ввід"}
        >
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={isListening ? "Говоріть..." : "Напишіть повідомлення..."}
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded-xl border px-3 py-2.5 md:px-4 outline-none transition-colors focus:border-[var(--t-border-strong)]"
        style={{
          backgroundColor: T.panelSoft,
          borderColor: isListening ? T.danger : T.borderSoft,
          color: T.textPrimary,
          fontSize: "16px",
          lineHeight: "1.5",
        }}
      />
      {isStreaming ? (
        <button
          onClick={onAbort}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors active:scale-95 tap-highlight-none"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
          title="Зупинити"
        >
          <Square className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 tap-highlight-none disabled:opacity-30"
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
