import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatHours } from "@/lib/utils";

type TeamMember = {
  id: string;
  name: string;
  minutes: number;
  activeTaskCount: number;
  overdueTaskCount: number;
};

export function TeamPulse({
  members,
  totalMinutes,
  periodLabel,
}: {
  members: TeamMember[];
  totalMinutes: number;
  periodLabel: string;
}) {
  const avatarColors = [
    { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    { bg: T.tealSoft, fg: T.teal },
    { bg: T.violetSoft, fg: T.violet },
    { bg: T.amberSoft, fg: T.amber },
    { bg: T.roseSoft, fg: T.rose },
  ];

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[10px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
            КОМАНДА
          </span>
          <h2
            className="text-base font-bold"
            style={{ color: T.textPrimary }}
          >
            Team Pulse
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            {formatHours(totalMinutes)} · {members.length} людей · {periodLabel}
          </span>
          <Link
            href="/admin-v2/me?scope=all"
            className="flex items-center gap-1 text-[11px] font-semibold"
            style={{ color: T.accentPrimary }}
          >
            Команда <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {members.length === 0 ? (
        <p className="text-[12px]" style={{ color: T.textMuted }}>
          Немає даних за цей період
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member, idx) => {
            const ac = avatarColors[idx % avatarColors.length];
            const pct = totalMinutes
              ? (member.minutes / totalMinutes) * 100
              : 0;
            const isOverloaded = member.minutes > 2400 || member.activeTaskCount > 15; // >40h or >15 tasks
            const isIdle = member.minutes === 0;

            return (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${isOverloaded ? T.danger + "40" : T.borderSoft}`,
                }}
              >
                {/* Avatar */}
                <span
                  className="inline-flex items-center justify-center h-7 w-7 rounded-full flex-shrink-0 text-[10px] font-bold"
                  style={{ backgroundColor: ac.bg, color: ac.fg }}
                >
                  {member.name.slice(0, 2).toUpperCase()}
                </span>

                {/* Name */}
                <span
                  className="flex-1 min-w-0 truncate text-[13px] font-semibold"
                  style={{ color: T.textPrimary }}
                >
                  {member.name}
                </span>

                {/* Status badges */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {member.overdueTaskCount > 0 && (
                    <span
                      className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                    >
                      <AlertTriangle size={9} />
                      {member.overdueTaskCount}
                    </span>
                  )}
                  {member.activeTaskCount > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                    >
                      {member.activeTaskCount} задач
                    </span>
                  )}
                  {isOverloaded && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                    >
                      перевантаж.
                    </span>
                  )}
                  {isIdle && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ backgroundColor: T.warningSoft, color: T.warning }}
                    >
                      без руху
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div
                  className="w-16 h-1.5 rounded-full overflow-hidden flex-shrink-0"
                  style={{ backgroundColor: ac.fg + "18" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isOverloaded ? T.danger : ac.fg,
                    }}
                  />
                </div>

                {/* Hours */}
                <span
                  className="font-mono font-bold text-[12px] w-16 text-right flex-shrink-0"
                  style={{ color: T.textPrimary }}
                >
                  {formatHours(member.minutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
