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
      className="premium-card rounded-2xl overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="section-head">
        <h2>Команда</h2>
        <span className="sub">
          {formatHours(totalMinutes)} · {members.length} людей · {periodLabel}
        </span>
        <Link href="/admin-v2/me?scope=all" className="action">
          Усі →
        </Link>
      </div>

      {members.length === 0 ? (
        <p className="text-[12.5px] px-5 py-6 text-center" style={{ color: T.textMuted }}>
          Немає даних за цей період
        </p>
      ) : (
        <ul>
          {members.map((member, idx) => {
            const ac = avatarColors[idx % avatarColors.length];
            const pct = totalMinutes
              ? (member.minutes / totalMinutes) * 100
              : 0;
            const isOverloaded = member.minutes > 2400 || member.activeTaskCount > 15;
            const isIdle = member.minutes === 0;

            return (
              <li
                key={member.id}
                className="flex items-center gap-3 px-5 py-2.5"
                style={{
                  borderTop: idx === 0 ? "none" : `1px solid ${T.borderSoft}`,
                }}
              >
                <span
                  className="inline-flex items-center justify-center h-7 w-7 rounded-full flex-shrink-0 text-[10px] font-bold"
                  style={{ backgroundColor: ac.bg, color: ac.fg }}
                >
                  {member.name.slice(0, 2).toUpperCase()}
                </span>

                <div className="flex-1 min-w-0">
                  <div
                    className="truncate text-[13px] font-medium"
                    style={{ color: T.textPrimary }}
                  >
                    {member.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {member.overdueTaskCount > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold"
                        style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                      >
                        <AlertTriangle size={9} />
                        {member.overdueTaskCount}
                      </span>
                    )}
                    {member.activeTaskCount > 0 && (
                      <span
                        className="text-[10.5px]"
                        style={{ color: T.textMuted }}
                      >
                        {member.activeTaskCount} активних
                      </span>
                    )}
                    {isOverloaded && (
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold"
                        style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                      >
                        перевантаж.
                      </span>
                    )}
                    {isIdle && (
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold"
                        style={{ backgroundColor: T.warningSoft, color: T.warning }}
                      >
                        без руху
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className="w-20 h-1.5 rounded-full overflow-hidden flex-shrink-0"
                  style={{ backgroundColor: T.panelElevated }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isOverloaded ? T.danger : ac.fg,
                    }}
                  />
                </div>

                <span
                  className="font-mono font-semibold text-[12px] w-14 text-right flex-shrink-0 tabular-nums"
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
