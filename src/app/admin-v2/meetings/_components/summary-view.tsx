"use client";

import { CheckCircle2, ListTodo, MessageSquare, ArrowRight, HelpCircle, Sparkles } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { MeetingStructured } from "./types";

export function SummaryView({ data }: { data: MeetingStructured }) {
  return (
    <div className="flex flex-col gap-4">
      {data.summary && (
        <Card icon={<Sparkles size={18} />} title="Підсумок" color={T.accentPrimary} tint={T.accentPrimarySoft}>
          <p className="text-sm leading-relaxed" style={{ color: T.textPrimary }}>
            {data.summary}
          </p>
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
            {data.tasks.map((task, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{ background: T.panelElevated }}
              >
                <p className="text-sm font-medium" style={{ color: T.textPrimary }}>
                  {task.title}
                </p>
                <div className="mt-1 flex gap-4 text-xs" style={{ color: T.textMuted }}>
                  {task.assignee && <span>Відповідальний: {task.assignee}</span>}
                  {task.dueDate && <span>Дедлайн: {task.dueDate}</span>}
                </div>
              </div>
            ))}
          </div>
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
