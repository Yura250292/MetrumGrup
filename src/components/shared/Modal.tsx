"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: ModalSize;
  /** Footer slot (типово — Cancel + Submit). */
  footer?: React.ReactNode;
  /** Закривати на Esc (default true). */
  closeOnEsc?: boolean;
  /** Закривати на клік поза dialog (default true). */
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
};

/**
 * Базовий dialog поверх портала. Backdrop + центрування + ESC + focus
 * на open. Без зовнішніх deps (radix не встановлено).
 *
 * Використання:
 *   const [open, setOpen] = useState(false);
 *   <Modal open={open} onClose={()=>setOpen(false)} title="Підтвердити"
 *     footer={<Button onClick={...}>OK</Button>}>
 *     Текст...
 *   </Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  closeOnEsc = true,
  closeOnBackdrop = true,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeOnEsc, onClose]);

  // Auto-focus перший focusable у dialog. Прибирає клавіатурний скрол
  // body на background page.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = dialogRef.current?.querySelector<HTMLElement>(
      "input, button, textarea, select, a[href], [tabindex]:not([tabindex='-1'])",
    );
    first?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.6)" }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div
        ref={dialogRef}
        className={`relative w-full ${SIZE_CLASS[size]} rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]`}
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <header
            className="flex items-start justify-between gap-4 px-5 py-4"
            style={{ borderBottom: `1px solid ${T.borderSoft}` }}
          >
            <div className="min-w-0">
              {title && (
                <h2
                  id="modal-title"
                  className="text-[16px] font-bold leading-tight truncate"
                  style={{ color: T.textPrimary }}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  className="text-[12px] mt-0.5"
                  style={{ color: T.textSecondary }}
                >
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition hover:brightness-95"
              style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              aria-label="Закрити"
            >
              <X size={15} />
            </button>
          </header>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{
              backgroundColor: T.panelSoft,
              borderTop: `1px solid ${T.borderSoft}`,
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
