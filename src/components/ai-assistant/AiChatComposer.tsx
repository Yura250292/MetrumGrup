"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Mic, MicOff } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * Post-process voice recognition output:
 * - Fix abbreviations: "а те бе" → "АТБ"
 * - Convert spoken numbers: "2 мільйони 700 тисяч" → "2 700 000"
 * - Fix common voice-to-text issues in Ukrainian
 */
function postProcessVoice(text: string): string {
  let result = text;

  // Fix abbreviations (letter-by-letter spelled out)
  const abbrevMap: Record<string, string> = {
    "а те бе": "АТБ",
    "а т б": "АТБ",
    "атб": "АТБ",
    "пе де ве": "ПДВ",
    "п д в": "ПДВ",
    "пдв": "ПДВ",
    "е с ве": "ЕСВ",
    "ка пі ай": "KPI",
    "фо п": "ФОП",
    "фоп": "ФОП",
    "те о ве": "ТОВ",
    "тов": "ТОВ",
    "ай ті": "IT",
  };
  for (const [spoken, correct] of Object.entries(abbrevMap)) {
    result = result.replace(new RegExp(spoken, "gi"), correct);
  }

  // Convert spoken numbers to digits
  // "два мільйони сімсот тисяч" → "2700000"
  const numWords: Record<string, number> = {
    "нуль": 0, "один": 1, "одна": 1, "одну": 1, "два": 2, "дві": 2, "три": 3,
    "чотири": 4, "п'ять": 5, "пять": 5, "шість": 6, "сім": 7, "вісім": 8, "дев'ять": 9, "девять": 9,
    "десять": 10, "одинадцять": 11, "дванадцять": 12, "тринадцять": 13,
    "чотирнадцять": 14, "п'ятнадцять": 15, "двадцять": 20, "тридцять": 30,
    "сорок": 40, "п'ятдесят": 50, "пятдесят": 50, "шістдесят": 60,
    "сімдесят": 70, "вісімдесят": 80, "дев'яносто": 90, "сто": 100,
    "двісті": 200, "триста": 300, "чотириста": 400, "п'ятсот": 500, "пятсот": 500,
    "шістсот": 600, "сімсот": 700, "вісімсот": 800, "дев'ятсот": 900, "девятсот": 900,
  };

  // Handle "X мільйонів Y тисяч Z"
  result = result.replace(
    /(\d+)\s*мільйон(?:ів|и|а)?\s*(\d+)\s*тисяч(?:і|а|)?\b/gi,
    (_, m, t) => `${Number(m) * 1000000 + Number(t) * 1000}`,
  );
  result = result.replace(
    /(\d+)\s*мільйон(?:ів|и|а)?\b/gi,
    (_, m) => `${Number(m) * 1000000}`,
  );
  result = result.replace(
    /(\d+)\s*тисяч(?:і|а|)?\b/gi,
    (_, t) => `${Number(t) * 1000}`,
  );

  // "мільйон" alone = 1000000
  result = result.replace(/\bмільйон\b/gi, "1000000");
  result = result.replace(/\bтисяча?\b/gi, "1000");

  // Replace word numbers with digits
  for (const [word, num] of Object.entries(numWords)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, "gi"), String(num));
  }

  // Clean up multiple spaces
  result = result.replace(/\s+/g, " ").trim();

  // Capitalize first letter
  if (result.length > 0) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

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

  // Stop voice properly — nullify ref so onend won't restart
  const stopVoice = useCallback(() => {
    const r = recognitionRef.current;
    recognitionRef.current = null;
    r?.stop();
    setIsListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      stopVoice();
      return;
    }

    const win = window as unknown as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (win.SpeechRecognition ?? win.webkitSpeechRecognition) as any;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "uk-UA";
    recognition.interimResults = false; // only final results — cleaner output
    recognition.continuous = true; // keep listening until manually stopped
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: { results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        const cleaned = postProcessVoice(transcript);
        setValue((prev) => prev ? `${prev} ${cleaned}` : cleaned);
      }
    };

    recognition.onend = () => {
      // In continuous mode, restart if still listening (browser may stop)
      if (recognitionRef.current === recognition && isListening) {
        try { recognition.start(); } catch { setIsListening(false); }
      } else {
        setIsListening(false);
      }
    };
    recognition.onerror = (e: { error: string }) => {
      if (e.error !== "no-speech") setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [isListening, stopVoice]);

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
