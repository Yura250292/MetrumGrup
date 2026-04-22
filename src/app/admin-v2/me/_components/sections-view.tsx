"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { EmptyState } from "@/components/shared/states";
import { SectionHeader } from "@/app/admin-v2/_components/dashboard/section-header";
import type { TaskItem } from "./use-me-tasks";
import {
  groupBySection,
  SECTION_LABEL,
  SECTION_HINT,
  SECTION_ORDER,
  type SectionKey,
} from "../_lib/sections";
import { TaskRowExtended } from "./task-row-extended";

type Props = {
  tasks: TaskItem[];
  currentUserId: string;
  loading: boolean;
  activeTimerTaskId: string | null;
  pendingId: string | null;
  onOpenDrawer: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onMarkDone: (task: TaskItem) => void;
};

// Sections with sub-groups rendered together (Блокери).
const BLOCKER_GROUP: SectionKey[] = ["blocked-by", "blocking-others"];

export function SectionsView({
  tasks,
  currentUserId,
  loading,
  activeTimerTaskId,
  pendingId,
  onOpenDrawer,
  onStartTimer,
  onStopTimer,
  onMarkDone,
}: Props) {
  const buckets = useMemo(
    () => groupBySection(tasks, currentUserId),
    [tasks, currentUserId],
  );

  // Which sections have content — used to decide default expanded state
  const nonEmpty = (key: SectionKey) => buckets[key].length > 0;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isCollapsed = (id: string, defaultOpen: boolean) => {
    if (id in collapsed) return collapsed[id];
    return !defaultOpen;
  };
  const toggle = (id: string, defaultOpen: boolean) =>
    setCollapsed((prev) => ({ ...prev, [id]: !isCollapsed(id, defaultOpen) }));

  if (loading) {
    return (
      <section
        className="rounded-2xl p-8 text-center text-[13px]"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        Завантаження…
      </section>
    );
  }

  const allEmpty = SECTION_ORDER.every((k) => buckets[k].length === 0);
  if (allEmpty) {
    return (
      <EmptyState
        title="На цей момент все під контролем"
        description="Немає активних задач для тебе. Коли щось з'явиться — воно буде тут."
      />
    );
  }

  const renderGroup = (
    id: string,
    label: string,
    hint: string,
    sectionTasks: TaskItem[],
  ) => {
    const defaultOpen = sectionTasks.length > 0;
    const open = !isCollapsed(id, defaultOpen);
    return (
      <div key={id} className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => toggle(id, defaultOpen)}
          className="flex items-center justify-between gap-3 w-full text-left"
        >
          <SectionHeader
            label={`${label} · ${sectionTasks.length}`}
            hint={hint}
          />
          <span style={{ color: T.textMuted }}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {open && (
          <>
            {sectionTasks.length === 0 ? (
              <p className="text-[11px] pl-1" style={{ color: T.textMuted }}>
                Порожньо
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {sectionTasks.map((t) => (
                  <TaskRowExtended
                    key={t.id}
                    task={t}
                    isTimerActive={activeTimerTaskId === t.id}
                    pending={pendingId === t.id}
                    onOpen={() => onOpenDrawer(t.id)}
                    onStartTimer={() => onStartTimer(t.id)}
                    onStopTimer={onStopTimer}
                    onMarkDone={() => onMarkDone(t)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    );
  };

  // Блокери render as combined group with two sub-lists
  const renderBlockers = () => {
    const mineBlocked = buckets["blocked-by"];
    const iBlock = buckets["blocking-others"];
    if (mineBlocked.length === 0 && iBlock.length === 0) return null;

    const id = "blockers-combined";
    const defaultOpen = true;
    const open = !isCollapsed(id, defaultOpen);
    const total = mineBlocked.length + iBlock.length;
    return (
      <div key={id} className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => toggle(id, defaultOpen)}
          className="flex items-center justify-between gap-3 w-full text-left"
        >
          <SectionHeader label={`Блокери · ${total}`} hint="Що тримає команду" />
          <span style={{ color: T.textMuted }}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {open && (
          <div className="flex flex-col gap-3">
            {mineBlocked.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>
                  Мене блокують
                </p>
                <ul className="flex flex-col gap-1.5">
                  {mineBlocked.map((t) => (
                    <TaskRowExtended
                      key={t.id}
                      task={t}
                      isTimerActive={activeTimerTaskId === t.id}
                      pending={pendingId === t.id}
                      onOpen={() => onOpenDrawer(t.id)}
                      onStartTimer={() => onStartTimer(t.id)}
                      onStopTimer={onStopTimer}
                      onMarkDone={() => onMarkDone(t)}
                    />
                  ))}
                </ul>
              </div>
            )}
            {iBlock.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>
                  Я блокую інших
                </p>
                <ul className="flex flex-col gap-1.5">
                  {iBlock.map((t) => (
                    <TaskRowExtended
                      key={t.id}
                      task={t}
                      isTimerActive={activeTimerTaskId === t.id}
                      pending={pendingId === t.id}
                      onOpen={() => onOpenDrawer(t.id)}
                      onStartTimer={() => onStartTimer(t.id)}
                      onStopTimer={onStopTimer}
                      onMarkDone={() => onMarkDone(t)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {SECTION_ORDER.map((key) => {
        if (BLOCKER_GROUP.includes(key)) {
          if (key === "blocked-by") return renderBlockers();
          return null; // blocking-others rendered inside blockers group
        }
        if (!nonEmpty(key)) return null;
        return renderGroup(key, SECTION_LABEL[key], SECTION_HINT[key], buckets[key]);
      })}
    </div>
  );
}
