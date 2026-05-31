"use client";

import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  Building,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  HardHat,
  MapPin,
  MessageSquare,
  Sparkles,
  UserCircle2,
} from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { formatDateShort } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DeleteProjectButton } from "./delete-project-button";
import { MoveProjectButton } from "./project-folders-client";
import type { ProjectRow } from "./projects-types";

/**
 * Project Card v2 — повна v2 reincarnation за Pencil-mockup
 * (projects-page-v2.pen). Усі signals для будівельника на одній картці:
 * - project code overlay
 * - status badge з кольоровою точкою
 * - адреса з map pin
 * - active stage name (з actual ProjectStageRecord) з прогрес-баром
 * - PM avatar + name + foreman/team count
 * - deadline countdown chip з 5 рівнями кольору
 * - budget burn (для SUPER_ADMIN)
 * - RFI alert badge
 */
export function ProjectCardV2({
  project,
  canDelete,
  currentFolderId,
  showFinance,
  currentUserId,
}: {
  project: ProjectRow;
  canDelete: boolean;
  currentFolderId: string | null;
  /** Глобальний доступ до фінансів (SUPER_ADMIN — canViewFinance). */
  showFinance: boolean;
  /** ID поточного користувача — для per-project PM-доступу. */
  currentUserId: string;
}) {
  // Бюджет на картці видимий якщо:
  //   - користувач має глобальний доступ (SUPER_ADMIN), АБО
  //   - користувач є project.manager для цього проєкту (ПМ свого проєкту).
  // Все ще STRICT для решти: цифри інших проєктів недоступні.
  const canSeeBudget =
    showFinance || project.manager?.id === currentUserId;
  const extra = project.extra;
  const stageName =
    extra.activeStageName ??
    (project.status === "COMPLETED" ? "Завершено" : "Не задано");
  const stageInfo =
    extra.activeStageIndex !== null && extra.totalStageCount > 0
      ? `${extra.activeStageIndex} з ${extra.totalStageCount}`
      : extra.totalStageCount > 0
        ? `${extra.totalStageCount} етапів`
        : "етапи не задані";

  const budgetPct =
    canSeeBudget && project.totalBudget > 0
      ? Math.round(
          (Number(project.totalPaid) / Number(project.totalBudget)) * 100,
        )
      : 0;

  // Real Project.code з міграції 20260529150000_projects_subsystem_alignment
  // (наприклад "PRJ-2026-001"). Fallback на slug-based для legacy без code.
  const code = extra.code ?? `PRJ-${project.slug.toUpperCase().slice(0, 8)}`;
  // Real Project.type ("Житло"/"Комерція"/"Благоустрій"/"IT"/...) — вільний рядок
  // в БД. Fallback на heuristic за keywords у title.
  const projectType = extra.type
    ? typeFromString(extra.type)
    : inferProjectType(project.title);

  return (
    <Link
      href={`/admin-v2/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl transition hover:brightness-95 hover:shadow-md"
      style={{
        backgroundColor: T.panel,
        border: project.isTestProject
          ? `1px dashed ${T.warning}`
          : `1px solid ${T.borderSoft}`,
        opacity: project.isTestProject ? 0.65 : 1,
      }}
    >
      {/* Cover area з overlays */}
      <CoverArea
        coverImage={extra.coverImage}
        projectType={projectType}
        status={project.status}
        isTestProject={project.isTestProject}
        title={project.title}
        rfiCount={extra.openRfiCount}
        projectId={project.id}
        currentFolderId={currentFolderId}
        canDelete={canDelete}
      />

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {/* Code + Title */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="text-[10px] font-bold tracking-wider tabular-nums"
              style={{ color: T.textMuted }}
            >
              {code}
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
              style={{ backgroundColor: projectType.bg, color: projectType.fg }}
            >
              {projectType.label}
            </span>
          </div>
          <h3
            className="text-[15px] font-bold leading-tight line-clamp-2"
            style={{ color: T.textPrimary }}
            title={project.title}
          >
            {project.title}
          </h3>
        </div>

        {/* Address */}
        {project.address && (
          <div className="flex items-start gap-1.5">
            <MapPin size={12} style={{ color: T.textMuted }} className="mt-0.5 flex-shrink-0" />
            <span
              className="text-[11px] leading-snug line-clamp-1"
              style={{ color: T.textSecondary }}
            >
              {project.address}
            </span>
          </div>
        )}

        {/* Active stage block */}
        <div
          className="rounded-lg px-2.5 py-2"
          style={{ backgroundColor: T.panelSoft }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[9px] font-bold tracking-wider"
              style={{ color: T.textMuted }}
            >
              ПОТОЧНИЙ ЕТАП · {stageInfo}
            </span>
            <span
              className="text-[11px] font-bold tabular-nums"
              style={{
                color:
                  project.stageProgress >= 80
                    ? T.success
                    : project.stageProgress >= 30
                      ? T.accentPrimary
                      : T.warning,
              }}
            >
              {project.stageProgress}%
            </span>
          </div>
          <div
            className="text-[12px] font-semibold mb-1.5 truncate"
            style={{ color: T.textPrimary }}
          >
            {stageName}
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: T.borderSoft }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.max(0, project.stageProgress))}%`,
                backgroundColor:
                  project.stageProgress >= 80
                    ? T.success
                    : project.stageProgress >= 30
                      ? T.accentPrimary
                      : T.warning,
              }}
            />
          </div>
        </div>

        {/* Team + Deadline */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {project.manager ? (
              <>
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0 text-[10px] font-bold"
                  style={{
                    backgroundColor: T.violet,
                    color: "#FFFFFF",
                  }}
                  title={`ПМ: ${project.manager.name}`}
                >
                  {initials(project.manager.name)}
                </div>
                <span
                  className="text-[11px] font-semibold truncate"
                  style={{ color: T.textPrimary }}
                >
                  {project.manager.name}
                </span>
              </>
            ) : (
              <>
                <UserCircle2 size={14} style={{ color: T.textMuted }} />
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  ПМ не призначено
                </span>
              </>
            )}
          </div>
          <DeadlineChip endDate={extra.expectedEndDate} startDate={project.startDate} />
        </div>

        {/* Footer: budget (super_admin) + activity signals */}
        <div
          className="flex items-center justify-between gap-2 pt-2 border-t text-[11px]"
          style={{ borderColor: T.borderSoft }}
        >
          {canSeeBudget && project.totalBudget > 0 ? (
            <div className="flex flex-col min-w-0">
              <span className="font-bold tabular-nums" style={{ color: T.textPrimary }}>
                {formatCompact(Number(project.totalPaid))} /{" "}
                {formatCompact(Number(project.totalBudget))} ₴
              </span>
              <span
                className="text-[10px] font-semibold"
                style={{
                  color:
                    budgetPct > 80 ? T.danger : budgetPct > 60 ? T.warning : T.textMuted,
                }}
              >
                {budgetPct}% освоєно
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <Building2 size={11} style={{ color: T.textMuted }} />
              <span className="text-[10px] truncate" style={{ color: T.textMuted }}>
                {project.client?.name ?? "—"}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0">
            {extra.hasApprovedEstimate && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
                style={{ color: T.success }}
                title="Кошторис затверджено"
              >
                <CheckCircle2 size={11} />
              </span>
            )}
            {extra.estimatesCount > 0 && !extra.hasApprovedEstimate && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
                style={{ color: T.warning }}
                title={`${extra.estimatesCount} кошторисів`}
              >
                <Sparkles size={11} />
                {extra.estimatesCount}
              </span>
            )}
            {project.unreadChatCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
                style={{ color: T.accentPrimary }}
                title={`${project.unreadChatCount} непрочитаних повідомлень`}
              >
                <MessageSquare size={11} />
                {project.unreadChatCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ---------- Sub-components ---------- */

function CoverArea({
  coverImage,
  projectType,
  status,
  isTestProject,
  title,
  rfiCount,
  projectId,
  currentFolderId,
  canDelete,
}: {
  coverImage: string | null;
  projectType: ProjectTypeStyle;
  status: ProjectStatus;
  isTestProject: boolean;
  title: string;
  rfiCount: number;
  projectId: string;
  currentFolderId: string | null;
  canDelete: boolean;
}) {
  // Pastel gradient placeholder коли немає фото — щоб не сірий "Building" icon,
  // а кольоровий блок відповідно до категорії проєкту (як у Pencil-mockup).
  const gradientStyle: React.CSSProperties = coverImage
    ? { backgroundColor: T.panelElevated }
    : {
        background: `linear-gradient(135deg, ${projectType.coverFrom} 0%, ${projectType.coverTo} 100%)`,
      };
  return (
    <div
      className="relative aspect-[16/9] flex items-center justify-center overflow-hidden"
      style={gradientStyle}
    >
      {coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImage}
          alt={title}
          className="h-full w-full object-cover"
        />
      ) : (
        <Building
          size={56}
          style={{ color: projectType.fg, opacity: 0.55 }}
          strokeWidth={1.5}
        />
      )}

      {/* Top-left: project type chip */}
      <span
        className="absolute top-2.5 left-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider"
        style={{
          backgroundColor: "rgba(15, 23, 42, 0.75)",
          color: "#FFFFFF",
          backdropFilter: "blur(4px)",
        }}
      >
        {projectType.label}
      </span>

      {/* Top-right: status + actions */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
        {isTestProject && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
            style={{
              backgroundColor: T.warningSoft,
              color: T.warning,
              border: `1px dashed ${T.warning}`,
            }}
            title="Тестовий проєкт"
          >
            ТЕСТ
          </span>
        )}
        <StatusBadgeV2 status={status} />
        <span className="hidden sm:inline-flex" onClick={(e) => e.preventDefault()}>
          <MoveProjectButton projectId={projectId} currentFolderId={currentFolderId} />
        </span>
        {canDelete && (
          <span onClick={(e) => e.preventDefault()}>
            <DeleteProjectButton projectId={projectId} projectTitle={title} />
          </span>
        )}
      </div>

      {/* Bottom-left: RFI alerts if any */}
      {rfiCount > 0 && (
        <div
          className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            backdropFilter: "blur(4px)",
          }}
        >
          <AlertTriangle size={11} />
          {rfiCount} RFI
        </div>
      )}
    </div>
  );
}

function StatusBadgeV2({ status }: { status: ProjectStatus }) {
  const map: Record<
    string,
    { bg: string; fg: string; dot: string; label: string }
  > = {
    DRAFT: { bg: T.warningSoft, fg: T.warning, dot: T.warning, label: "Чернетка" },
    ACTIVE: { bg: T.successSoft, fg: T.success, dot: T.success, label: "Активний" },
    ON_HOLD: {
      bg: T.panelSoft,
      fg: T.textMuted,
      dot: T.textMuted,
      label: "Призупинено",
    },
    COMPLETED: {
      bg: T.accentPrimarySoft,
      fg: T.accentPrimary,
      dot: T.accentPrimary,
      label: "Завершено",
    },
    CANCELLED: { bg: T.dangerSoft, fg: T.danger, dot: T.danger, label: "Скасовано" },
  };
  const c = map[status] ?? map.DRAFT;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: c.dot }}
      />
      {c.label}
    </span>
  );
}

function DeadlineChip({
  endDate,
  startDate,
}: {
  endDate: Date | string | null;
  startDate: Date | string | null;
}) {
  if (!endDate) {
    if (!startDate) return null;
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] flex-shrink-0"
        style={{ color: T.textMuted }}
      >
        <Calendar size={11} />з {formatDateShort(startDate)}
      </span>
    );
  }
  const end = new Date(endDate);
  const now = new Date();
  const days = Math.round((end.getTime() - now.getTime()) / 86_400_000);

  let bg: string = T.panelElevated;
  let fg: string = T.textMuted;
  let Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> = Calendar;
  let label: string;

  if (days < 0) {
    bg = T.dangerSoft;
    fg = T.danger;
    Icon = AlertOctagon;
    label = `-${Math.abs(days)} дн`;
  } else if (days <= 14) {
    bg = T.dangerSoft;
    fg = T.danger;
    Icon = Clock;
    label = `${days} дн`;
  } else if (days <= 30) {
    bg = T.warningSoft;
    fg = T.warning;
    Icon = Clock;
    label = `${days} дн`;
  } else if (days <= 90) {
    bg = T.skySoft;
    fg = T.sky;
    Icon = CalendarCheck;
    label = `${days} дн`;
  } else {
    bg = T.successSoft;
    fg = T.success;
    Icon = CalendarCheck;
    label = `${days} дн`;
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums flex-shrink-0"
      style={{ backgroundColor: bg, color: fg }}
      title={`Дедлайн: ${formatDateShort(end)}`}
    >
      <Icon size={11} style={{ color: fg }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/* ---------- Helpers ---------- */

type ProjectTypeStyle = {
  bg: string;
  fg: string;
  label: string;
  /** Pastel gradient для cover-area коли немає фото. */
  coverFrom: string;
  coverTo: string;
};

/**
 * Канонічні палітри по категорії проєкту. Кожен має:
 * - bg/fg — chip під code
 * - coverFrom/coverTo — м'який пастельний градієнт як placeholder для cover
 */
const TYPE_PALETTE = {
  housing: {
    bg: T.amberSoft,
    fg: T.amber,
    label: "Житло",
    coverFrom: "#FEF3C7",
    coverTo: "#FDE68A",
  },
  commercial: {
    bg: T.skySoft,
    fg: T.sky,
    label: "Комерція",
    coverFrom: "#E0E7FF",
    coverTo: "#C7D2FE",
  },
  landscape: {
    bg: T.successSoft,
    fg: T.success,
    label: "Благоустрій",
    coverFrom: "#D1FAE5",
    coverTo: "#A7F3D0",
  },
  infra: {
    bg: T.tealSoft,
    fg: T.teal,
    label: "Інфра-ра",
    coverFrom: "#CCFBF1",
    coverTo: "#99F6E4",
  },
  internal: {
    bg: T.violetSoft,
    fg: T.violet,
    label: "Внутр.",
    coverFrom: "#EDE9FE",
    coverTo: "#DDD6FE",
  },
  other: {
    bg: T.panelSoft,
    fg: T.textSecondary,
    label: "Інше",
    coverFrom: T.panelElevated,
    coverTo: T.panelSoft,
  },
} as const satisfies Record<string, ProjectTypeStyle>;

/**
 * Маппить вільний рядок Project.type (вкл. ЖК/Комерція/Благоустрій/IT/Інше)
 * на канонічну палітру. Case-insensitive.
 */
function typeFromString(raw: string): ProjectTypeStyle {
  const t = raw.toLowerCase().trim();
  if (/житл|жк|апартам|квартир/.test(t)) return TYPE_PALETTE.housing;
  if (/комерц|офіс|трц|готел|бц/.test(t)) return TYPE_PALETTE.commercial;
  if (/благоустр|парк|ландшафт|алея|сквер/.test(t)) return TYPE_PALETTE.landscape;
  if (/інфра|склад|hub|логіст|депо|дорог/.test(t)) return TYPE_PALETTE.infra;
  if (/it|crm|erp|систем|внутр|метрум/.test(t)) return TYPE_PALETTE.internal;
  // Безпечний fallback з власною міткою з БД.
  return { ...TYPE_PALETTE.other, label: raw };
}

/**
 * Infer project category from title keywords. Tactical heuristic для legacy
 * проєктів без заповненого Project.type. Повертає той самий тип palette.
 */
function inferProjectType(title: string): ProjectTypeStyle {
  const t = title.toLowerCase();
  if (/жк|будинок|корпус|поверх|квартир/.test(t)) return TYPE_PALETTE.housing;
  if (/трц|офіс|бізнес-центр|комерц|готель/.test(t)) return TYPE_PALETTE.commercial;
  if (/парк|сквер|благоустр|алея|тротуар|реконструкц/.test(t)) return TYPE_PALETTE.landscape;
  if (/склад|hub|логіст|депо/.test(t)) return TYPE_PALETTE.infra;
  if (/crm|erp|систем|метрум/.test(t)) return TYPE_PALETTE.internal;
  return TYPE_PALETTE.other;
}

// Touch imports to avoid unused warnings (used conditionally).
void PROJECT_STATUS_LABELS;
void HardHat;
void UserCircle2;

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toFixed(0);
}
