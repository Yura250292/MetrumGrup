"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";
import { useStandalone } from "@/hooks/useStandalone";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "metrum-install-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

/**
 * Floating install banner that surfaces the browser's
 * `beforeinstallprompt` event. Auto-hides after install or dismiss
 * (with a 14-day grace period). Skipped when already running in
 * standalone mode.
 */
export function InstallPrompt() {
  const isStandalone = useStandalone();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isStandalone]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    } else {
      dismiss();
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed left-3 right-3 z-50 mx-auto max-w-md rounded-2xl border border-t-border bg-t-panel p-3 shadow-2xl md:left-auto md:right-6 md:bottom-6"
          style={{
            bottom: "calc(80px + env(safe-area-inset-bottom))",
            backdropFilter: "saturate(180%) blur(14px)",
            WebkitBackdropFilter: "saturate(180%) blur(14px)",
          }}
          role="dialog"
          aria-label="Встановити Metrum Group як застосунок"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{
                background:
                  "linear-gradient(135deg, var(--t-accent-soft) 0%, var(--t-violet-soft) 100%)",
              }}
            >
              <Download size={18} className="text-t-1" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight text-t-1">
                Встановити Metrum
              </p>
              <p className="text-[11px] leading-tight text-t-3">
                Доступ із головного екрану
              </p>
            </div>
            <button
              type="button"
              onClick={install}
              className="btn-shimmer rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-shadow hover:shadow-md"
            >
              Встановити
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Сховати"
              className="rounded-lg p-1.5 text-t-3 transition-colors hover:text-t-1"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
