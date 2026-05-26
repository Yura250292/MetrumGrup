"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronRight, ChevronLeft, HelpCircle, AlertCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useReducedMotion } from "@/components/landing/three/hooks/useReducedMotion";
import type { HelpTour } from "@/lib/help/types";

const Z_TOUR = 10000;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

function calcPosition(
  rect: DOMRect | null,
  hint: string,
  cw: number,
  ch: number,
): React.CSSProperties {
  if (!rect) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sides = [hint, "bottom", "right", "left", "top"];

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
  return { top: vh / 2 - ch / 2, left: vw / 2 - cw / 2 };
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
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
  const [missing, setMissing] = useState(false);
  const reduced = useReducedMotion();
  const popoverRef = useRef<HTMLDivElement>(null);

  const cur = tour.steps[step];
  const isLast = step === tour.steps.length - 1;
  const isFirst = step === 0;

  // Resolve target with retries: до 6 спроб × 100 ms = ~600 ms,
  // покриває випадки коли елемент щойно з'явився після close-drawer + animation.
  useEffect(() => {
    if (!cur) return;
    let attempts = 0;
    let cancelled = false;
    setMissing(false);
    setTargetRect(null);

    const tick = () => {
      if (cancelled) return;
      attempts += 1;
      const el = document.querySelector(cur.selector);
      if (el && isVisible(el)) {
        try {
          el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
        } catch {
          /* ignore old browsers */
        }
        // Чекаємо завершення scroll (≈300ms) перш ніж зняти rect.
        const delay = reduced ? 0 : 320;
        setTimeout(() => {
          if (cancelled) return;
          setTargetRect(el.getBoundingClientRect());
        }, delay);
        return;
      }
      if (attempts < 6) {
        setTimeout(tick, 100);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[GuidedTour] selector not found after ${attempts} attempts: ${cur.selector}`,
        );
        setMissing(true);
      }
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [cur, reduced]);

  const next = useCallback(() => {
    if (isLast) onClose(true);
    else setStep((s) => s + 1);
  }, [isLast, onClose]);
  const prev = useCallback(() => {
    if (!isFirst) setStep((s) => s - 1);
  }, [isFirst]);

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

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const id = setTimeout(() => {
      popoverRef.current?.querySelector<HTMLElement>("button")?.focus();
    }, 80);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(id);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  if (!cur) return null;

  const CW = 320;
  const CH = 220;
  const pos = calcPosition(targetRect, cur.position || "bottom", CW, CH);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: Z_TOUR }}
      role="dialog"
      aria-modal="true"
      aria-label={`Тур: ${tour.title}`}
    >
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        onClick={() => onClose(false)}
        aria-hidden="true"
      >
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
          style={{
            position: "absolute",
            pointerEvents: "none",
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            borderRadius: 12,
            border: `2px solid ${T.accentPrimary}`,
            boxShadow: `0 0 22px ${T.accentPrimary}66`,
            transition: reduced ? "none" : "all 250ms ease-out",
          }}
        />
      )}

      <div
        ref={popoverRef}
        style={{
          position: "absolute",
          width: CW,
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: 14,
          padding: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          ...pos,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <HelpCircle size={14} style={{ color: T.accentPrimary }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>
              {step + 1} / {tour.steps.length}
            </span>
          </div>
          <button
            onClick={() => onClose(false)}
            aria-label="Закрити тур"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: T.textMuted,
              padding: 2,
              display: "inline-flex",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            height: 4,
            borderRadius: 999,
            backgroundColor: T.panelSoft,
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 999,
              width: `${((step + 1) / tour.steps.length) * 100}%`,
              background: `linear-gradient(90deg, ${T.accentPrimary}, ${T.accentSecondary})`,
              transition: reduced ? "none" : "width 400ms ease-out",
            }}
          />
        </div>

        <h3
          style={{
            margin: 0,
            marginBottom: 6,
            fontSize: 14,
            fontWeight: 700,
            color: T.textPrimary,
          }}
        >
          {cur.title}
        </h3>
        <p
          style={{
            margin: 0,
            marginBottom: 12,
            fontSize: 12,
            lineHeight: 1.55,
            color: T.textSecondary,
            whiteSpace: "pre-wrap",
          }}
        >
          {cur.description}
        </p>

        {missing && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 8,
              backgroundColor: T.warningSoft,
              color: T.warning,
              fontSize: 11,
              marginBottom: 10,
            }}
          >
            <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Елемент кроку зараз недоступний на сторінці. Можливо, потрібно перейти на іншу вкладку
              або вибрати проєкт. Натисніть «Далі» — підсвітимо наступний крок.
            </span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={prev}
            disabled={isFirst}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              fontSize: 12,
              fontWeight: 500,
              color: T.textSecondary,
              opacity: isFirst ? 0.3 : 1,
              background: "none",
              border: "none",
              cursor: isFirst ? "default" : "pointer",
              padding: 0,
            }}
          >
            <ChevronLeft size={14} /> Назад
          </button>
          <button
            onClick={next}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 14px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
              border: "none",
              cursor: "pointer",
            }}
          >
            {isLast ? "Готово!" : "Далі"}
            {!isLast && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
