"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { WidgetSize, WidgetType, WidgetInstance } from "./layout-schema";
import { WIDGET_REGISTRY } from "./widget-registry";
import { WidgetFrame } from "./widget-frame";
import { WidgetPicker } from "./widget-picker";
import { useDashboardLayoutContext } from "./dashboard-shell";

export function DashboardGrid({ slots }: { slots: Partial<Record<WidgetType, ReactNode>> }) {
  const { layout, isEditing, updateLayout } = useDashboardLayoutContext();
  const [pickerOpen, setPickerOpen] = useState(false);

  // PWA/touch: longer delay + tighter tolerance prevents accidental drags
  // when the user is trying to scroll the dashboard vertically.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const widgets = useMemo(
    () => [...layout.desktop.widgets].sort((a, b) => a.order - b.order),
    [layout.desktop.widgets],
  );

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = widgets.findIndex((w) => w.id === e.active.id);
    const newIndex = widgets.findIndex((w) => w.id === e.over!.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(widgets, oldIndex, newIndex).map((w, i) => ({
      ...w,
      order: i,
    }));
    updateLayout({
      ...layout,
      desktop: { widgets: reordered },
    });
  }

  function handleResize(id: string, size: WidgetSize) {
    updateLayout({
      ...layout,
      desktop: {
        widgets: widgets.map((w) => (w.id === id ? { ...w, size } : w)),
      },
    });
  }

  function handleRemove(id: string) {
    updateLayout({
      ...layout,
      desktop: {
        widgets: widgets.filter((w) => w.id !== id).map((w, i) => ({ ...w, order: i })),
      },
    });
  }

  function handleAdd(type: WidgetType) {
    const def = WIDGET_REGISTRY[type];
    if (!def) return;
    const newWidget: WidgetInstance = {
      id: `w-${type}-${Date.now().toString(36)}`,
      type,
      size: def.defaultSize,
      order: widgets.length,
    };
    updateLayout({
      ...layout,
      desktop: { widgets: [...widgets, newWidget] },
    });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={widgets.map((w) => w.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
            {widgets.map((w) => {
              const def = WIDGET_REGISTRY[w.type];
              if (!def) return null;
              const body = def.Render
                ? def.Render({})
                : slots[w.type] ?? <MissingSlot type={w.type} />;
              return (
                <WidgetFrame
                  key={w.id}
                  widget={w}
                  isEditing={isEditing}
                  onResize={handleResize}
                  onRemove={handleRemove}
                >
                  {body}
                </WidgetFrame>
              );
            })}
            {isEditing && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="col-span-12 sm:col-span-6 lg:col-span-6 flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl text-[13px] font-semibold transition hover:brightness-[0.97]"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `2px dashed ${T.accentPrimary}`,
                  color: T.accentPrimary,
                }}
              >
                <Plus size={22} />
                Додати віджет
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>
      {pickerOpen && (
        <WidgetPicker onAdd={handleAdd} onClose={() => setPickerOpen(false)} />
      )}
    </>
  );
}

function MissingSlot({ type }: { type: WidgetType }) {
  return (
    <div
      className="flex h-full items-center justify-center rounded-2xl p-4 text-[12px]"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px dashed ${T.borderSoft}`,
        color: T.textMuted,
      }}
    >
      Дані для «{type}» недоступні
    </div>
  );
}
