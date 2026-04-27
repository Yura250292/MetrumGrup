"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Maximize2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { WidgetInstance, WidgetSize } from "./layout-schema";
import { WIDGET_REGISTRY, getSizeClasses } from "./widget-registry";

type WidgetFrameProps = {
  widget: WidgetInstance;
  children: ReactNode;
  isEditing: boolean;
  onResize: (id: string, size: WidgetSize) => void;
  onRemove: (id: string) => void;
};

export function WidgetFrame({
  widget,
  children,
  isEditing,
  onResize,
  onRemove,
}: WidgetFrameProps) {
  const def = WIDGET_REGISTRY[widget.type];
  const sizeClasses = getSizeClasses(widget.size);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: widget.id,
    disabled: !isEditing,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${sizeClasses} min-h-[160px]`}
    >
      {isEditing && (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
          style={{
            border: `1.5px dashed ${T.accentPrimary}`,
            backgroundColor: T.accentPrimary + "06",
          }}
        />
      )}

      {isEditing && (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
          <ResizeMenu
            sizes={def?.sizes ?? ["1x1", "2x1"]}
            current={widget.size}
            onSelect={(size) => onResize(widget.id, size)}
          />
          <button
            type="button"
            onClick={() => onRemove(widget.id)}
            className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md transition hover:brightness-110 touch-manipulation"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderSoft}`,
              color: T.danger,
            }}
            aria-label="Видалити віджет"
          >
            <X size={13} />
          </button>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-10 w-10 sm:h-8 sm:w-8 cursor-grab items-center justify-center rounded-md transition active:cursor-grabbing hover:brightness-110"
            style={{
              backgroundColor: T.accentPrimary,
              color: "#fff",
              touchAction: "none",
            }}
            aria-label="Перетягнути"
          >
            <GripVertical size={13} />
          </button>
        </div>
      )}

      <div className="h-full w-full">{children}</div>
    </div>
  );
}

function ResizeMenu({
  sizes,
  current,
  onSelect,
}: {
  sizes: readonly WidgetSize[];
  current: WidgetSize;
  onSelect: (size: WidgetSize) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md transition hover:brightness-110 touch-manipulation"
        style={{
          backgroundColor: T.panelElevated,
          border: `1px solid ${T.borderSoft}`,
          color: T.textPrimary,
        }}
        aria-label="Розмір"
      >
        <Maximize2 size={12} />
      </button>
      {open && (
        <div
          className="dropdown-menu-enter dropdown-menu-enter-right absolute right-0 top-full mt-1 w-28 rounded-lg p-1 shadow-lg"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            zIndex: 40,
          }}
        >
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onSelect(s);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] font-semibold transition hover:brightness-[0.97]"
              style={{
                backgroundColor: s === current ? T.accentPrimary + "12" : "transparent",
                color: s === current ? T.accentPrimary : T.textPrimary,
              }}
            >
              {s}
              {s === current && <span style={{ fontSize: 9 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
