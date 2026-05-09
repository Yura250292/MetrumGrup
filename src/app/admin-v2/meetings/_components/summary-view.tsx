"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ListTodo,
  MessageSquare,
  ArrowRight,
  HelpCircle,
  Sparkles,
  UserPlus,
  Wand2,
  Target,
  Flag,
  AlertTriangle,
  BookOpen,
  Users,
  Lightbulb,
  Pencil,
  Check,
  X,
  ListOrdered,
  BookOpenText,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type {
  MeetingSpeaker,
  MeetingStructured,
  MeetingTask,
  MeetingPriorityLevel,
} from "./types";

const PRIORITY_LABEL: Record<MeetingPriorityLevel, string> = {
  HIGH: "Високий",
  MEDIUM: "Середній",
  LOW: "Низький",
};

function priorityColors(level: MeetingPriorityLevel) {
  if (level === "HIGH") return { bg: T.dangerSoft, fg: T.danger };
  if (level === "MEDIUM") return { bg: T.amberSoft, fg: T.amber };
  return { bg: T.tealSoft, fg: T.teal };
}

export type DelegationState = {
  [taskIndex: number]: { taskId: string };
};

export function SummaryView({
  data,
  onDelegate,
  onAiHelp,
  delegated,
  onSpeakerEdit,
}: {
  data: MeetingStructured;
  onDelegate?: (index: number, task: MeetingTask) => void;
  onAiHelp?: (task: MeetingTask) => void;
  delegated?: DelegationState;
  onSpeakerEdit?: (
    label: string,
    patch: { guessedName?: string | null; role?: string | null },
  ) => Promise<void> | void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {data.summary && (
        <Card icon={<Sparkles size={18} />} title="Підсумок" color={T.accentPrimary} tint={T.accentPrimarySoft}>
          <p
            className="whitespace-pre-line text-sm leading-relaxed"
            style={{ color: T.textPrimary }}
          >
            {data.summary}
          </p>
        </Card>
      )}

      {data.context && (
        <Card icon={<BookOpen size={18} />} title="Контекст" color={T.sky} tint={T.skySoft}>
          <p
            className="whitespace-pre-line text-sm leading-relaxed"
            style={{ color: T.textPrimary }}
          >
            {data.context}
          </p>
        </Card>
      )}

      {data.speakers && data.speakers.length > 0 && (
        <Card icon={<Users size={18} />} title="Спікери" color={T.indigo} tint={T.indigoSoft}>
          <div className="flex flex-col gap-2">
            {data.speakers.map((s, i) => (
              <SpeakerCard
                key={i}
                speaker={s}
                onEdit={onSpeakerEdit}
              />
            ))}
          </div>
        </Card>
      )}

      {data.goals && data.goals.length > 0 && (
        <Card icon={<Target size={18} />} title="Цілі" color={T.emerald} tint={T.emeraldSoft}>
          <BulletList items={data.goals} />
        </Card>
      )}

      {data.priorities && data.priorities.length > 0 && (
        <Card icon={<Flag size={18} />} title="Пріоритети" color={T.rose} tint={T.roseSoft}>
          <div className="flex flex-col gap-2">
            {data.priorities.map((p, i) => {
              const c = priorityColors(p.level);
              return (
                <div
                  key={i}
                  className="rounded-lg p-3"
                  style={{ background: T.panelElevated }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className="text-sm font-medium"
                      style={{ color: T.textPrimary }}
                    >
                      {p.title}
                    </p>
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-semibold"
                      style={{ background: c.bg, color: c.fg }}
                    >
                      {PRIORITY_LABEL[p.level]}
                    </span>
                  </div>
                  {p.reason && (
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: T.textMuted }}
                    >
                      {p.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {data.keyPoints?.length > 0 && (
        <Card icon={<MessageSquare size={18} />} title="Ключові моменти" color={T.indigo} tint={T.indigoSoft}>
          <BulletList items={data.keyPoints} />
        </Card>
      )}

      {data.decisions?.length > 0 && (
        <Card icon={<CheckCircle2 size={18} />} title="Прийняті рішення" color={T.success} tint={T.successSoft}>
          <BulletList items={data.decisions} />
        </Card>
      )}

      {data.tasks?.length > 0 && (
        <Card icon={<ListTodo size={18} />} title="Задачі" color={T.violet} tint={T.violetSoft}>
          <div className="flex flex-col gap-2">
            {data.tasks.map((task, i) => {
              const isDelegated = !!delegated?.[i];
              const pri = task.priority
                ? priorityColors(task.priority)
                : null;
              return (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-lg p-3"
                  style={{ background: T.panelElevated }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p
                        className="flex-1 text-sm font-medium"
                        style={{ color: T.textPrimary }}
                      >
                        {task.title}
                      </p>
                      {task.priority && pri && (
                        <span
                          className="flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={{ background: pri.bg, color: pri.fg }}
                        >
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                      )}
                    </div>
                    {task.context && (
                      <p
                        className="mt-1.5 text-xs leading-relaxed"
                        style={{ color: T.textSecondary }}
                      >
                        {task.context}
                      </p>
                    )}
                    {task.successCriteria && (
                      <p
                        className="mt-1 text-xs leading-relaxed"
                        style={{ color: T.textMuted }}
                      >
                        <span style={{ color: T.success }}>✓</span> Критерій успіху: {task.successCriteria}
                      </p>
                    )}
                    <div
                      className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs"
                      style={{ color: T.textMuted }}
                    >
                      {task.assignee && (
                        <span>Відповідальний: {task.assignee}</span>
                      )}
                      {task.dueDate && <span>Дедлайн: {task.dueDate}</span>}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {onAiHelp && (
                      <button
                        onClick={() => onAiHelp(task)}
                        className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
                        style={{
                          background: T.accentPrimarySoft,
                          color: T.accentPrimary,
                        }}
                        title="Запитати AI-помічника як виконати"
                      >
                        <Wand2 size={13} />
                        AI-помічник
                      </button>
                    )}
                    {onDelegate &&
                      (isDelegated ? (
                        <span
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                          style={{ background: T.successSoft, color: T.success }}
                        >
                          <CheckCircle2 size={14} />
                          Делеговано
                        </span>
                      ) : (
                        <button
                          onClick={() => onDelegate(i, task)}
                          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-white"
                          style={{ background: T.violet }}
                        >
                          <UserPlus size={13} />
                          Делегувати
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {data.risks && data.risks.length > 0 && (
        <Card
          icon={<AlertTriangle size={18} />}
          title="Ризики та блокери"
          color={T.amber}
          tint={T.amberSoft}
        >
          <BulletList items={data.risks} />
        </Card>
      )}

      {data.proposedSolutions && data.proposedSolutions.length > 0 && (
        <Card
          icon={<Lightbulb size={18} />}
          title="Запропоновані рішення"
          color={T.emerald}
          tint={T.emeraldSoft}
        >
          <div className="flex flex-col gap-3">
            {data.proposedSolutions.map((s, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{ background: T.panelElevated }}
              >
                <div
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: T.amber }}
                >
                  Проблема
                </div>
                <p
                  className="mt-1 text-sm font-medium leading-relaxed"
                  style={{ color: T.textPrimary }}
                >
                  {s.problem}
                </p>
                <div
                  className="mt-3 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: T.emerald }}
                >
                  Порада
                </div>
                <p
                  className="mt-1 whitespace-pre-line text-sm leading-relaxed"
                  style={{ color: T.textPrimary }}
                >
                  {s.suggestion}
                </p>
                {s.rationale && (
                  <>
                    <div
                      className="mt-3 text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: T.textMuted }}
                    >
                      Обґрунтування
                    </div>
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: T.textMuted }}
                    >
                      {s.rationale}
                    </p>
                  </>
                )}
                {s.relatedTo && (
                  <p
                    className="mt-2 text-xs"
                    style={{ color: T.textMuted }}
                  >
                    Стосується: <span style={{ color: T.textSecondary }}>{s.relatedTo}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.actionPlan && data.actionPlan.length > 0 && (
        <Card
          icon={<ListOrdered size={18} />}
          title="Покроковий план"
          color={T.indigo}
          tint={T.indigoSoft}
        >
          <ol className="flex flex-col gap-3">
            {data.actionPlan
              .slice()
              .sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
              .map((s, i) => (
                <li
                  key={i}
                  className="rounded-lg p-3"
                  style={{ background: T.panelElevated }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold"
                      style={{ background: T.indigoSoft, color: T.indigo }}
                    >
                      {s.step ?? i + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <p
                        className="text-sm font-semibold leading-snug"
                        style={{ color: T.textPrimary }}
                      >
                        {s.title}
                      </p>
                      {s.detail && (
                        <p
                          className="text-[12px] leading-relaxed"
                          style={{ color: T.textSecondary }}
                        >
                          {s.detail}
                        </p>
                      )}
                      {s.owner && (
                        <span
                          className="mt-0.5 inline-flex w-fit rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                          style={{
                            background: T.panel,
                            color: T.textMuted,
                            border: `1px solid ${T.borderSoft}`,
                          }}
                        >
                          {s.owner}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
          </ol>
        </Card>
      )}

      {data.nextSteps?.length > 0 && (
        <Card icon={<ArrowRight size={18} />} title="Наступні кроки" color={T.teal} tint={T.tealSoft}>
          <BulletList items={data.nextSteps} />
        </Card>
      )}

      {data.openQuestions?.length > 0 && (
        <Card icon={<HelpCircle size={18} />} title="Невирішені питання" color={T.amber} tint={T.amberSoft}>
          <BulletList items={data.openQuestions} />
        </Card>
      )}

      {data.glossary && data.glossary.length > 0 && (
        <Card
          icon={<BookOpenText size={18} />}
          title="Глосарій термінів"
          color={T.sky}
          tint={T.skySoft}
        >
          <div className="flex flex-col gap-2.5">
            {data.glossary.map((g, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{ background: T.panelElevated }}
              >
                <p
                  className="text-sm font-bold"
                  style={{ color: T.sky }}
                >
                  {g.term}
                </p>
                <p
                  className="mt-1 text-[12px] leading-relaxed"
                  style={{ color: T.textPrimary }}
                >
                  {g.definition}
                </p>
                {g.contextInMeeting && (
                  <p
                    className="mt-1.5 text-[11px] italic leading-relaxed"
                    style={{ color: T.textMuted }}
                  >
                    У цій нараді: {g.contextInMeeting}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Card({
  icon,
  title,
  color,
  tint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: tint, color }}
        >
          {icon}
        </span>
        <h3 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2 text-sm leading-relaxed"
          style={{ color: T.textPrimary }}
        >
          <span style={{ color: T.textMuted }}>•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SpeakerCard({
  speaker,
  onEdit,
}: {
  speaker: MeetingSpeaker;
  onEdit?: (
    label: string,
    patch: { guessedName?: string | null; role?: string | null },
  ) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(speaker.guessedName ?? "");
  const [role, setRole] = useState(speaker.role ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!onEdit) return;
    setSaving(true);
    try {
      await onEdit(speaker.label, {
        guessedName: name.trim() || null,
        role: role.trim() || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setName(speaker.guessedName ?? "");
    setRole(speaker.role ?? "");
    setEditing(false);
  }

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: T.panelElevated }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-2 text-xs font-bold"
          style={{ background: T.indigoSoft, color: T.indigo }}
        >
          {speaker.label}
        </span>
        {editing ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") cancel();
              }}
              placeholder="Імʼя (напр. Олег)"
              className="flex-1 rounded-md px-2 py-1 text-sm outline-none"
              style={{
                background: T.panel,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
                minWidth: 140,
              }}
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") cancel();
              }}
              placeholder="Роль (необов.)"
              className="rounded-md px-2 py-1 text-xs outline-none"
              style={{
                background: T.panel,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
                width: 140,
              }}
            />
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-md p-1.5 disabled:opacity-50"
              style={{ background: T.successSoft, color: T.success }}
              title="Зберегти"
            >
              <Check size={14} />
            </button>
            <button
              onClick={cancel}
              disabled={saving}
              className="rounded-md p-1.5 disabled:opacity-50"
              style={{ background: T.panel, color: T.textMuted }}
              title="Скасувати"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <span
              className="text-sm font-semibold"
              style={{ color: T.textPrimary }}
            >
              {speaker.guessedName ?? "не вдалося визначити"}
            </span>
            {speaker.role && (
              <span
                className="rounded-md px-2 py-0.5 text-xs"
                style={{ background: T.panel, color: T.textMuted }}
              >
                {speaker.role}
              </span>
            )}
            {onEdit && (
              <button
                onClick={() => setEditing(true)}
                className="ml-auto rounded-md p-1 transition hover:bg-[var(--t-panel)]"
                style={{ color: T.textMuted }}
                title="Вказати імʼя і роль"
              >
                <Pencil size={12} />
              </button>
            )}
          </>
        )}
      </div>
      {!editing && speaker.evidence && (
        <p
          className="mt-1.5 text-xs italic leading-relaxed"
          style={{ color: T.textMuted }}
        >
          «{speaker.evidence}»
        </p>
      )}
    </div>
  );
}
