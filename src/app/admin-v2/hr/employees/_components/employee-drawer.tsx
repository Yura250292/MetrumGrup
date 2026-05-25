"use client";
/**
 * Бічна панель з досьє співробітника. Відкривається з табличного списку
 * (клік по рядку), щоб не йти на окрему сторінку. Аналог
 * `ResizableDrawerWrapper` з task-drawer-shared.tsx.
 *
 * Глибокі посилання `/admin-v2/hr/employees/[id]` далі працюють — повна
 * сторінка лишається; це лише швидкий перегляд у контексті списку.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { EmployeeDossier } from "./employee-dossier";

const STORAGE_KEY = "employeeDrawer.width";
const DEFAULT_WIDTH = 880;
const MIN_WIDTH = 480;

export function EmployeeDrawer({
  id,
  currentUserRole,
  onClose,
}: {
  id: string;
  currentUserRole: string;
  onClose: () => void;
}) {
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const draggingRef = useRef(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (!isNaN(saved) && saved >= MIN_WIDTH) setWidth(saved);
  }, []);

  // ESC закриває панель.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const maxWidth = Math.floor(window.innerWidth * 0.9);
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.max(MIN_WIDTH, Math.min(maxWidth, window.innerWidth - ev.clientX));
      setWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setWidth((curr) => {
        try {
          localStorage.setItem(STORAGE_KEY, String(curr));
        } catch {}
        return curr;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <>
      {/* Backdrop — клік поза панеллю закриває. */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        aria-hidden
      />
      <div
        className="fixed right-0 top-0 bottom-0 z-50 overflow-y-auto"
        style={{
          width,
          maxWidth: "100vw",
          backgroundColor: T.background,
          borderLeft: `1px solid ${T.borderStrong}`,
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Drag-handle на лівій межі — лише на desktop. */}
        <div
          onMouseDown={startDrag}
          className="hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 hover:bg-blue-500/40 transition"
          title="Перетягніть щоб змінити ширину"
          aria-label="Змінити ширину панелі"
        />
        {/* Кнопка закриття — фіксована вгорі справа над контентом. */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded-lg p-1.5 transition hover:bg-black/5"
          style={{ color: T.textSecondary }}
          aria-label="Закрити панель"
          title="Закрити (Esc)"
        >
          <X size={18} />
        </button>
        <div className="p-4 sm:p-6">
          <EmployeeDossier
            id={id}
            currentUserRole={currentUserRole}
            inPanel
          />
        </div>
      </div>
    </>
  );
}
