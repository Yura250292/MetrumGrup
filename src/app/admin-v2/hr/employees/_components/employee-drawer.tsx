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
import { useSession } from "next-auth/react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { EmployeeDossier } from "./employee-dossier";

// Префікс ключа localStorage додає userId — налаштування зберігаються
// окремо для кожного юзера (різні люди на одному браузері не перетирають
// одне одному ширину).
const STORAGE_PREFIX = "employeeDrawer.width";
const DEFAULT_WIDTH = 880;
const MIN_WIDTH = 480;

function storageKeyFor(userId: string | undefined): string {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

export function EmployeeDrawer({
  id,
  currentUserRole,
  onClose,
}: {
  id: string;
  currentUserRole: string;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = Number(localStorage.getItem(storageKeyFor(userId)));
    if (!isNaN(saved) && saved >= MIN_WIDTH) setWidth(saved);
  }, [userId]);

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
    // Без жорсткого max — лиш не дозволяємо панель ширшу за viewport.
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.max(MIN_WIDTH, Math.min(window.innerWidth, window.innerWidth - ev.clientX));
      setWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setWidth((curr) => {
        try {
          localStorage.setItem(storageKeyFor(userId), String(curr));
        } catch {}
        return curr;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <>
      {/* Без backdrop — список ліворуч лишається активним: клік на іншого
       *  співробітника просто перемикає id у drawer'і (контролюється батьком). */}
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
