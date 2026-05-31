"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ToastKind = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  durationMs: number;
};

type ToastContextValue = {
  toast: (input: {
    kind?: ToastKind;
    title?: string;
    message: string;
    durationMs?: number;
  }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toast notifications через React Context. Стек у нижньому правому куті,
 * auto-dismiss за durationMs (default 4000), manual close через X.
 *
 * Setup: загорни кореневий admin layout у <ToastProvider>...</ToastProvider>.
 * Виклик: const { success, error } = useToast(); success("Збережено");
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (
      kind: ToastKind,
      message: string,
      title?: string,
      durationMs = 4000,
    ) => {
      const id = `toast-${++idRef.current}`;
      setToasts((prev) => [...prev, { id, kind, message, title, durationMs }]);
      if (durationMs > 0) {
        setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    toast: ({ kind = "info", title, message, durationMs }) =>
      push(kind, message, title, durationMs),
    success: (message, title) => push("success", message, title),
    error: (message, title) => push("error", message, title, 6000),
    warning: (message, title) => push("warning", message, title),
    info: (message, title) => push("info", message, title),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used within <ToastProvider>");
  }
  return ctx;
}

/** Безпечна версія: не кидає якщо нема провайдера — повертає no-op. */
export function useToastSafe(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    const noop = () => undefined;
    return {
      toast: noop,
      success: noop,
      error: noop,
      warning: noop,
      info: noop,
    };
  }
  return ctx;
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Slide-in animation
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const config = (() => {
    switch (toast.kind) {
      case "success":
        return { bg: T.successSoft, fg: T.success, icon: CheckCircle2 };
      case "error":
        return { bg: T.dangerSoft, fg: T.danger, icon: AlertCircle };
      case "warning":
        return { bg: T.warningSoft, fg: T.warning, icon: AlertTriangle };
      case "info":
      default:
        return { bg: T.accentPrimarySoft, fg: T.accentPrimary, icon: Info };
    }
  })();
  const Icon = config.icon;

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-3 shadow-lg transition-all ${
        visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${config.fg}40`,
        boxShadow: `0 4px 12px ${config.fg}26`,
      }}
      role="status"
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0"
        style={{ backgroundColor: config.bg }}
      >
        <Icon size={14} style={{ color: config.fg }} />
      </span>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div
            className="text-[12px] font-bold mb-0.5"
            style={{ color: T.textPrimary }}
          >
            {toast.title}
          </div>
        )}
        <div
          className="text-[12px] leading-snug"
          style={{ color: T.textSecondary }}
        >
          {toast.message}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-5 w-5 items-center justify-center rounded-md flex-shrink-0 transition hover:brightness-90"
        style={{ color: T.textMuted }}
        aria-label="Закрити"
      >
        <X size={13} />
      </button>
    </div>
  );
}
