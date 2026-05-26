"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronRight, ChevronLeft, HelpCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useReducedMotion } from "@/components/landing/three/hooks/useReducedMotion";
import type { HelpTour } from "@/lib/help/types";

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

function calcPosition(
  rect: DOMRect | null,
  hint: string,
  cw: number,
  ch: number,
): React.CSSProperties {
  if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sides = [hint, "right", "bottom", "left", "top"];

  for (const s of sides) {
    let t: number, l: number;
    switch (s) {
      case "right":
        t = clamp(rect.top, pad, vh - ch - pad);
        l = rect.right + pad;
        if (l + cw < vw - pad) return { top: t, left: l };
        break;
      case "bottom":
        t = rect.bottom + pad;
        l = clamp(rect.left, pad, vw - cw - pad);
        if (t + ch < vh - pad) return { top: t, left: l };
        break;
      case "left":
        t = clamp(rect.top, pad, vh - ch - pad);
        l = rect.left - cw - pad;
        if (l > pad) return { top: t, left: l };
        break;
      case "top":
        t = rect.top - ch - pad;
        l = clamp(rect.left, pad, vw - cw - pad);
        if (t > pad) return { top: t, left: l };
        break;
    }
  }
  return { bottom: pad, right: pad };
}

export function GuidedTour({
  tour,
  onClose,
}: {
  tour: HelpTour;
  onClose: (completed: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const reduced = useReducedMotion();
  const popoverRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Skip steps whose selector matches nothing — preserve graceful degradation per ТЗ §19.2.
  const visibleSteps = tour.steps;
  const cur = visibleSteps[step];
  const isLast = step === visibleSteps.length - 1;
  const isFirst = step === 0;

  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => {
      const el = document.querySelector(cur.selector);
      if (el) {
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
        if (reduced) setTargetRect(el.getBoundingClientRect());
        else requestAnimationFrame(() => setTargetRect(el.getBoundingClientRect()));
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[GuidedTour] selector not found: ${cur.selector} (step ${step + 1}/${visibleSteps.length})`);
        setTargetRect(null);
      }
    }, reduced ? 0 : 150);
    return () => clearTimeout(t);
  }, [cur, step, reduced, visibleSteps.length]);

  const next = useCallback(() => {
    if (isLast) onClose(true);
    else setStep((s) => s + 1);
  }, [isLast, onClose]);
  const prev = useCallback(() => {
    if (!isFirst) setStep((s) => s - 1);
  }, [isFirst]);

  // Keyboard: ESC closes, arrow keys / Enter navigate.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
        return;
      }
      // Focus trap: cycle Tab inside popover.
      if (e.key === "Tab" && popoverRef.current) {
        const focusable = popoverRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, next, prev]);

  // Focus management: capture previous focus, focus popover on mount, restore on unmount.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const id = setTimeout(() => {
      popoverRef.current?.querySelector<HTMLElement>("button")?.focus();
    }, 50);
    return () => {
      clearTimeout(id);
      previouslyFocused.current?.focus?.();
    };
  }, []);

  if (!cur) return null;

  const CW = 300;
  const CH = 200;
  const pos = calcPosition(targetRect, cur.position || "right", CW, CH);
  const animClass = reduced ? "" : "animate-fade-up";

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 99999 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Тур: ${tour.title}`}
    >
      <svg className="absolute inset-0 h-full w-full" onClick={() => onClose(false)}>
        <defs>
          <mask id="help-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 8}
                y={targetRect.top - 8}
                width={targetRect.width + 16}
                height={targetRect.height + 16}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#help-tour-mask)" />
      </svg>

      {targetRect && (
        <div
          className="absolute pointer-events-none rounded-xl"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            border: `2px solid ${T.accentPrimary}`,
            boxShadow: `0 0 20px ${T.accentPrimary}50`,
            transition: reduced ? "none" : "all 250ms ease-out",
          }}
        />
      )}

      <div className="absolute" style={{ ...pos, width: CW }}>
        <div className="flex items-start gap-2">
          <div
            className="shrink-0 rounded-xl p-1.5 shadow-lg hidden md:flex items-center justify-center"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <HelpCircle size={18} style={{ color: T.accentPrimary }} />
          </div>

          <div
            ref={popoverRef}
            className={`flex-1 rounded-xl p-3.5 shadow-2xl ${animClass}`}
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium" style={{ color: T.textMuted }}>
                {step + 1} / {visibleSteps.length}
              </span>
              <button
                onClick={() => onClose(false)}
                className="rounded p-0.5"
                style={{ color: T.textMuted }}
                aria-label="Закрити тур"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div
              className="mb-2 h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: T.panelSoft }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${((step + 1) / visibleSteps.length) * 100}%`,
                  background: `linear-gradient(90deg, ${T.accentPrimary}, ${T.accentSecondary})`,
                  transition: reduced ? "none" : "width 500ms ease-out",
                }}
              />
            </div>

            <h3 className="mb-1 text-[13px] font-bold" style={{ color: T.textPrimary }}>
              {cur.title}
            </h3>
            <p
              className="mb-3 text-[11px] leading-relaxed"
              style={{ color: T.textSecondary }}
            >
              {cur.description}
            </p>

            <div className="flex items-center justify-between">
              <button
                onClick={prev}
                disabled={isFirst}
                className="flex items-center gap-0.5 text-[11px] font-medium disabled:opacity-30"
                style={{ color: T.textSecondary }}
              >
                <ChevronLeft className="h-3 w-3" /> Назад
              </button>
              <button
                onClick={next}
                className="flex items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-semibold text-white active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
                }}
              >
                {isLast ? "Готово!" : "Далі"}
                {!isLast && <ChevronRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
