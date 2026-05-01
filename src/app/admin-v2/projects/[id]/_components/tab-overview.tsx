"use client";

import { Calendar, MapPin, Mail, Phone } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ProjectClientEditButton } from "@/components/projects/ProjectClientEditButton";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectStatus, ProjectStage, StageStatus } from "@prisma/client";
import { FinanceKpiStrip } from "./finance-kpi-strip";
import { StagesSection, type ResponsibleCandidate } from "./stages-section";
import type { StageRow } from "./stage-table";

export type ProjectDetailData = {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  currentStage: ProjectStage;
  currentStageRecordId: string | null;
  stageProgress: number;
  totalBudget: number;
  totalPaid: number;
  startDate: Date | null;
  expectedEndDate: Date | null;
  address: string | null;
  /** Display-name (free-text або snapshot контрагента). Заповнюється завжди. */
  clientName: string | null;
  clientCounterparty: { id: string; name: string } | null;
  client: { id: string; name: string; email: string | null; phone: string | null } | null;
  manager: { id: string; name: string; email: string; phone: string | null } | null;
  stages: StageRow[];
  responsibleCandidates: ResponsibleCandidate[];
  isTestProject: boolean;
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
    <div className="flex flex-col gap-6">
      {/* Finance KPI strip — пов'язує матрицю Plan vs Fact + cashflow в один погляд */}
      <FinanceKpiStrip projectId={project.id} />

      {/* Етапи виконання — на всю ширину */}
      <StagesSection
        projectId={project.id}
        projectTitle={project.title}
        initialStages={project.stages}
        candidates={project.responsibleCandidates}
        isTestProject={project.isTestProject}
      />

      {project.description && (
        <Card title="Опис проєкту">
          <p
            className="text-[13px] leading-relaxed whitespace-pre-wrap"
            style={{ color: T.textSecondary }}
          >
            {project.description}
          </p>
        </Card>
      )}

      {/* Фінанси / Дати / Контакти — рядок нижче, по 1/3 на десктопі */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
                  className="h-full rounded-full progress-fill-grow"
                  style={{
                    width: `${Math.min(100, (project.totalPaid / project.totalBudget) * 100)}%`,
                    backgroundColor: T.success,
                    boxShadow: `0 0 8px ${T.success}55`,
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
              <div className="flex items-center gap-1">
                <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                  {project.clientName ??
                    project.clientCounterparty?.name ??
                    project.client?.name ??
                    "—"}
                </span>
                <ProjectClientEditButton
                  projectId={project.id}
                  initial={
                    project.clientCounterparty
                      ? {
                          mode: "counterparty",
                          id: project.clientCounterparty.id,
                          name: project.clientCounterparty.name,
                        }
                      : project.clientName
                        ? { mode: "freetext", name: project.clientName }
                        : project.client
                          ? { mode: "freetext", name: project.client.name }
                          : null
                  }
                />
              </div>
              {project.client?.email && (
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
                  <Mail size={11} /> {project.client.email}
                </span>
              )}
              {project.client?.phone && (
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
