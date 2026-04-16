"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type KanbanStatus = {
  id: string;
  name: string;
  color: string;
  isDone: boolean;
  position: number;
};

export type KanbanCard = {
  id: string;
  title: string;
  statusId: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate: string | null;
  assignees: { user: { id: string; name: string; avatar: string | null } }[];
  labels: { label: { id: string; name: string; color: string } }[];
  _count?: { checklist: number; subtasks: number };
};

const PRIORITY_COLOR: Record<KanbanCard["priority"], string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

export function TaskKanban({
  statuses,
  cards,
  onMove,
  onOpen,
}: {
  statuses: KanbanStatus[];
  cards: KanbanCard[];
  onMove: (cardId: string, statusId: string, position: number) => void;
  onOpen: (cardId: string) => void;
}) {
  const [dragging, setDragging] = useState<KanbanCard | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
  );

  const byStatus = useMemo(() => {
    const m = new Map<string, KanbanCard[]>();
    for (const s of statuses) m.set(s.id, []);
    for (const c of cards) {
      const arr = m.get(c.statusId) ?? [];
      arr.push(c);
      m.set(c.statusId, arr);
    }
    return m;
  }, [cards, statuses]);

  const handleStart = (e: DragStartEvent) => {
    const c = cards.find((x) => x.id === String(e.active.id));
    setDragging(c ?? null);
  };

  const handleEnd = (e: DragEndEvent) => {
    setDragging(null);
    const cardId = String(e.active.id);
    const over = e.over;
    if (!over) return;

    const overId = String(over.id);
    // Dropped onto a column (id starts with col:)
    if (overId.startsWith("col:")) {
      const statusId = overId.slice(4);
      const existing = byStatus.get(statusId) ?? [];
      const nextPos = (existing[existing.length - 1]?.id === cardId
        ? existing.length - 1
        : existing.length);
      onMove(cardId, statusId, nextPos);
      return;
    }
    // Dropped onto another card — insert at its index in its column
    const target = cards.find((c) => c.id === overId);
    if (target) {
      const siblings = byStatus.get(target.statusId) ?? [];
      const idx = siblings.findIndex((c) => c.id === overId);
      onMove(cardId, target.statusId, idx >= 0 ? idx : siblings.length);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {statuses.map((s) => (
          <Column
            key={s.id}
            status={s}
            cards={byStatus.get(s.id) ?? []}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>
        {dragging ? <Card card={dragging} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  cards,
  onOpen,
}: {
  status: KanbanStatus;
  cards: KanbanCard[];
  onOpen: (cardId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status.id}` });
  return (
    <div
      ref={setNodeRef}
      className="flex flex-col gap-2 rounded-2xl p-3 min-w-[280px] w-[280px]"
      style={{
        backgroundColor: isOver ? T.panelElevated : T.panel,
        border: `1px solid ${isOver ? status.color : T.borderSoft}`,
      }}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <h4
            className="text-[12px] font-bold uppercase tracking-wide"
            style={{ color: T.textPrimary }}
          >
            {status.name}
          </h4>
        </div>
        <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
          {cards.length}
        </span>
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {cards.map((c) => (
            <SortableCard key={c.id} card={c} onOpen={() => onOpen(c.id)} />
          ))}
          {cards.length === 0 && (
            <div
              className="rounded-lg p-3 text-center text-[11px]"
              style={{ color: T.textMuted, border: `1px dashed ${T.borderSoft}` }}
            >
              Перетягніть задачу сюди
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ card, onOpen }: { card: KanbanCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card card={card} onOpen={onOpen} />
    </div>
  );
}

function Card({
  card,
  onOpen,
  dragging = false,
}: {
  card: KanbanCard;
  onOpen?: () => void;
  dragging?: boolean;
}) {
  return (
    <div
      onClick={onOpen}
      className="rounded-xl p-3 cursor-pointer flex flex-col gap-2 transition"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${dragging ? T.accentPrimary : T.borderSoft}`,
        boxShadow: dragging ? "0 8px 24px rgba(0,0,0,0.35)" : "none",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 inline-block h-2 w-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: PRIORITY_COLOR[card.priority] }}
        />
        <p className="text-[13px] font-medium flex-1" style={{ color: T.textPrimary }}>
          {card.title}
        </p>
      </div>
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.labels.slice(0, 4).map((l) => (
            <span
              key={l.label.id}
              className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
              style={{
                backgroundColor: l.label.color + "22",
                color: l.label.color,
              }}
            >
              {l.label.name}
            </span>
          ))}
        </div>
      )}
      <div
        className="flex items-center justify-between text-[10px] font-medium"
        style={{ color: T.textMuted }}
      >
        <div className="flex items-center gap-2">
          {card.dueDate && (
            <span>{new Date(card.dueDate).toLocaleDateString("uk-UA")}</span>
          )}
          {card._count?.checklist ? <span>☑ {card._count.checklist}</span> : null}
          {card._count?.subtasks ? <span>⇡ {card._count.subtasks}</span> : null}
        </div>
        {card.assignees.length > 0 && (
          <div className="flex -space-x-1.5">
            {card.assignees.slice(0, 3).map((a) => (
              <span
                key={a.user.id}
                title={a.user.name}
                className="inline-flex items-center justify-center rounded-full h-5 w-5 text-[9px] font-bold"
                style={{
                  backgroundColor: T.accentPrimarySoft,
                  color: T.accentPrimary,
                  border: `1px solid ${T.panel}`,
                }}
              >
                {a.user.name.slice(0, 2).toUpperCase()}
              </span>
            ))}
            {card.assignees.length > 3 && (
              <span
                className="inline-flex items-center justify-center rounded-full h-5 w-5 text-[9px] font-bold"
                style={{
                  backgroundColor: T.panel,
                  color: T.textMuted,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                +{card.assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
