"use client";

import { useState, useRef, useCallback } from "react";
import { X, Plus, RotateCw, Trash2, Wand2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FurnitureItem } from "@/lib/ai-render/types";

// ── Furniture palette ────────────────────────────────────────────

interface FurnitureTemplate {
  type: string;
  label: string;
  width: number;  // % of container
  height: number;
  color: string;
}

const FURNITURE_PALETTE: FurnitureTemplate[] = [
  { type: "sofa", label: "Диван", width: 18, height: 8, color: "#6366f1" },
  { type: "armchair", label: "Крісло", width: 8, height: 8, color: "#8b5cf6" },
  { type: "coffee_table", label: "Журн. стіл", width: 10, height: 6, color: "#a78bfa" },
  { type: "dining_table", label: "Обідній стіл", width: 14, height: 10, color: "#f59e0b" },
  { type: "chair", label: "Стілець", width: 5, height: 5, color: "#fbbf24" },
  { type: "bed", label: "Ліжко", width: 16, height: 20, color: "#3b82f6" },
  { type: "nightstand", label: "Тумбочка", width: 5, height: 5, color: "#60a5fa" },
  { type: "wardrobe", label: "Шафа", width: 16, height: 6, color: "#10b981" },
  { type: "desk", label: "Письм. стіл", width: 12, height: 7, color: "#14b8a6" },
  { type: "bookshelf", label: "Полиця", width: 12, height: 4, color: "#06b6d4" },
  { type: "bathtub", label: "Ванна", width: 8, height: 16, color: "#0ea5e9" },
  { type: "toilet", label: "Унітаз", width: 5, height: 6, color: "#38bdf8" },
];

let nextId = 1;

// ── Main component ──────────────────────────────────────────────

export function FurnitureEditor({
  imageUrl,
  onSubmit,
  onClose,
  isSubmitting,
}: {
  imageUrl: string;
  onSubmit: (items: FurnitureItem[]) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const [items, setItems] = useState<FurnitureItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const justFinishedDrag = useRef(false);

  const addItem = useCallback((template: FurnitureTemplate) => {
    const id = `f_${nextId++}`;
    setItems((prev) => [
      ...prev,
      {
        id,
        type: template.type,
        label: template.label,
        x: 50 - template.width / 2,
        y: 50 - template.height / 2,
        width: template.width,
        height: template.height,
        rotation: 0,
      },
    ]);
    setSelectedId(id);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const rotateItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const newRotation = (item.rotation + 90) % 360;
        // Swap width/height on rotation
        return {
          ...item,
          rotation: newRotation,
          width: item.height,
          height: item.width,
        };
      })
    );
  }, []);

  const toPercent = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, item: FurnitureItem) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedId(item.id);
      setDraggingId(item.id);
      const pos = toPercent(e.clientX, e.clientY);
      dragOffset.current = { x: pos.x - item.x, y: pos.y - item.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [toPercent]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingId) return;
      const pos = toPercent(e.clientX, e.clientY);
      setItems((prev) =>
        prev.map((item) =>
          item.id === draggingId
            ? {
                ...item,
                x: Math.max(0, Math.min(100 - item.width, pos.x - dragOffset.current.x)),
                y: Math.max(0, Math.min(100 - item.height, pos.y - dragOffset.current.y)),
              }
            : item
        )
      );
    },
    [draggingId, toPercent]
  );

  const handlePointerUp = useCallback(() => {
    if (draggingId) {
      justFinishedDrag.current = true;
      setTimeout(() => { justFinishedDrag.current = false; }, 50);
    }
    setDraggingId(null);
  }, [draggingId]);

  const selectedItem = items.find((i) => i.id === selectedId);
  const template = selectedItem
    ? FURNITURE_PALETTE.find((t) => t.type === selectedItem.type)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ backgroundColor: T.panel, borderBottom: `1px solid ${T.borderSoft}` }}
      >
        <span className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Редактор меблів
        </span>
        <div className="flex items-center gap-2">
          {selectedItem && (
            <>
              <button
                onClick={() => rotateItem(selectedItem.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
              >
                <RotateCw size={14} /> Повернути
              </button>
              <button
                onClick={() => removeItem(selectedItem.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ backgroundColor: T.dangerSoft, color: T.danger }}
              >
                <Trash2 size={14} /> Видалити
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:opacity-80"
            style={{ backgroundColor: T.panelElevated }}
          >
            <X size={16} style={{ color: T.textMuted }} />
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — furniture palette */}
        <div
          className="w-[180px] shrink-0 overflow-y-auto p-3 flex flex-col gap-1.5"
          style={{ backgroundColor: T.panel, borderRight: `1px solid ${T.borderSoft}` }}
        >
          <span className="text-[11px] font-semibold mb-1" style={{ color: T.textMuted }}>
            Додати меблі
          </span>
          {FURNITURE_PALETTE.map((tpl) => (
            <button
              key={tpl.type}
              onClick={() => addItem(tpl)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium text-left hover:opacity-80 transition-opacity"
              style={{ backgroundColor: T.panelElevated, color: T.textPrimary }}
            >
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: tpl.color }}
              />
              <Plus size={12} style={{ color: T.textMuted }} />
              {tpl.label}
            </button>
          ))}
        </div>

        {/* Canvas area */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div
            ref={containerRef}
            className="relative max-w-[800px] max-h-full aspect-square select-none"
            style={{ touchAction: "none" }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={() => { if (!justFinishedDrag.current) setSelectedId(null); }}
          >
            {/* Background image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Floor plan"
              className="w-full h-full object-contain rounded-xl"
              draggable={false}
            />

            {/* Furniture items */}
            {items.map((item) => {
              const tpl = FURNITURE_PALETTE.find((t) => t.type === item.type);
              const isSelected = item.id === selectedId;
              const rotationArrow = item.rotation === 0 ? "↑" : item.rotation === 90 ? "→" : item.rotation === 180 ? "↓" : "←";
              return (
                <div
                  key={item.id}
                  onPointerDown={(e) => handlePointerDown(e, item)}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }}
                  className="absolute flex items-center justify-center rounded-md cursor-move select-none transition-all duration-150"
                  style={{
                    left: `${item.x}%`,
                    top: `${item.y}%`,
                    width: `${item.width}%`,
                    height: `${item.height}%`,
                    backgroundColor: `${tpl?.color ?? "#666"}88`,
                    border: isSelected
                      ? `2px solid ${tpl?.color ?? "#fff"}`
                      : `1px solid ${tpl?.color ?? "#666"}aa`,
                    boxShadow: isSelected ? `0 0 0 2px ${tpl?.color ?? "#fff"}44` : "none",
                    zIndex: isSelected ? 10 : 1,
                    touchAction: "none",
                  }}
                >
                  <span
                    className="text-[10px] font-bold text-white drop-shadow-sm pointer-events-none text-center leading-tight px-0.5"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
                  >
                    {rotationArrow} {item.label}
                  </span>

                  {/* Inline controls on selected item */}
                  {isSelected && (
                    <div
                      className="absolute flex gap-1 pointer-events-auto"
                      style={{ top: -28, right: 0 }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); rotateItem(item.id); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="flex items-center justify-center w-6 h-6 rounded-md"
                        style={{ backgroundColor: tpl?.color ?? "#666", color: "#fff" }}
                        title="Повернути"
                      >
                        <RotateCw size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="flex items-center justify-center w-6 h-6 rounded-md"
                        style={{ backgroundColor: T.danger, color: "#fff" }}
                        title="Видалити"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ backgroundColor: T.panel, borderTop: `1px solid ${T.borderSoft}` }}
      >
        <span className="text-[12px]" style={{ color: T.textMuted }}>
          {items.length === 0
            ? "Додайте меблі з панелі зліва та розмістіть їх на плані"
            : `${items.length} ${items.length === 1 ? "предмет" : "предметів"} розміщено`}
        </span>
        <button
          onClick={() => onSubmit(items)}
          disabled={items.length === 0 || isSubmitting}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white active:scale-[0.97] transition disabled:opacity-40"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Wand2 size={14} />
          {isSubmitting ? "Генерація..." : "Перегенерувати"}
        </button>
      </div>
    </div>
  );
}
