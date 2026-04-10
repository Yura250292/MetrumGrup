"use client";

import Link from "next/link";
import { Calendar, MapPin, Mail, Phone, Edit3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";
import { StageTimeline } from "@/components/dashboard/StageTimeline";
import { ProjectProgressBar } from "@/components/dashboard/ProjectProgressBar";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectStatus, ProjectStage, StageStatus } from "@prisma/client";

export type ProjectDetailData = {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  currentStage: ProjectStage;
  stageProgress: number;
  totalBudget: number;
  totalPaid: number;
  startDate: Date | null;
  expectedEndDate: Date | null;
  address: string | null;
  client: { id: string; name: string; email: string; phone: string | null };
  manager: { id: string; name: string; email: string; phone: string | null } | null;
  stages: {
    id: string;
    stage: ProjectStage;
    status: StageStatus;
    progress: number;
    startDate: Date | null;
    endDate: Date | null;
    notes: string | null;
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    status: string;
    scheduledDate: Date;
    paidDate: Date | null;
    notes: string | null;
  }[];
  photoReports: {
    id: string;
    title: string;
    createdAt: Date;
    createdByName: string;
    firstImageUrl: string | null;
  }[];
  photoReportsCount: number;
};

export function TabOverview({ project }: { project: ProjectDetailData }) {
  const remaining = project.totalBudget - project.totalPaid;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left col */}
      <div className="xl:col-span-2 flex flex-col gap-6">
        {/* Progress + Stage timeline */}
        <Card title="Прогрес проєкту">
          <div className="mb-4">
            <ProjectProgressBar
              currentStage={project.currentStage}
              stages={project.stages}
            />
          </div>
          <div className="text-[12px]" style={{ color: T.textMuted }}>
            Поточний етап:{" "}
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {STAGE_LABELS[project.currentStage]}
            </span>{" "}
            · {project.stageProgress}% завершено
          </div>
        </Card>

        <Card
          title="Етапи виконання"
          action={
            <Link
              href={`/admin-v2/projects/${project.id}/stages`}
              className="flex items-center gap-1 text-xs font-semibold transition hover:brightness-125"
              style={{ color: T.accentPrimary }}
            >
              <Edit3 size={12} /> Редагувати
            </Link>
          }
        >
          <StageTimeline stages={project.stages} />
        </Card>

        {project.description && (
          <Card title="Опис проєкту">
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: T.textSecondary }}>
              {project.description}
            </p>
          </Card>
        )}
      </div>

      {/* Right col */}
      <div className="flex flex-col gap-6">
        {/* Financial summary */}
        <Card title="Фінанси">
          <div className="flex flex-col gap-3">
            <Stat label="Бюджет" value={formatCurrency(project.totalBudget)} />
            <Stat label="Сплачено" value={formatCurrency(project.totalPaid)} accent={T.success} />
            <Stat
              label="Залишок"
              value={formatCurrency(remaining)}
              accent={remaining > 0 ? T.warning : T.success}
            />
            {project.totalBudget > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: T.panelSoft }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (project.totalPaid / project.totalBudget) * 100)}%`,
                    backgroundColor: T.success,
                  }}
                />
              </div>
            )}
          </div>
        </Card>

        {/* Dates */}
        <Card title="Дати">
          <div className="flex flex-col gap-3">
            {project.startDate && (
              <div className="flex items-center gap-2">
                <Calendar size={14} style={{ color: T.accentPrimary }} />
                <div className="flex flex-col">
                  <span className="text-[10px]" style={{ color: T.textMuted }}>
                    Початок
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                    {new Date(project.startDate).toLocaleDateString("uk-UA")}
                  </span>
                </div>
              </div>
            )}
            {project.expectedEndDate && (
              <div className="flex items-center gap-2">
                <Calendar size={14} style={{ color: T.warning }} />
                <div className="flex flex-col">
                  <span className="text-[10px]" style={{ color: T.textMuted }}>
                    Очікуване завершення
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                    {new Date(project.expectedEndDate).toLocaleDateString("uk-UA")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Contacts */}
        <Card title="Контакти">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                КЛІЄНТ
              </span>
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                {project.client.name}
              </span>
              {project.client.email && (
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
                  <Mail size={11} /> {project.client.email}
                </span>
              )}
              {project.client.phone && (
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
                  <Phone size={11} /> {project.client.phone}
                </span>
              )}
            </div>
            {project.manager && (
              <div className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: T.borderSoft }}>
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  МЕНЕДЖЕР
                </span>
                <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                  {project.manager.name}
                </span>
                {project.manager.email && (
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
                    <Mail size={11} /> {project.manager.email}
                  </span>
                )}
                {project.manager.phone && (
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
                    <Phone size={11} /> {project.manager.phone}
                  </span>
                )}
              </div>
            )}
            {project.address && (
              <div className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: T.borderSoft }}>
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  АДРЕСА
                </span>
                <span className="flex items-center gap-1.5 text-[13px]" style={{ color: T.textSecondary }}>
                  <MapPin size={12} /> {project.address}
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = T.textPrimary,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-[14px] font-bold" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}
