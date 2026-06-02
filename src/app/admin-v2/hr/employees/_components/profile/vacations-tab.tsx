"use client";
/** Вкладка «Відпустки» — рахується клієнтом із записів TimeOff. */
import { useMemo } from "react";
import { P } from "./profile-tokens";
import { Badge, Divider, KpiCard } from "./field";
import {
  type TimeOffRecord,
  TIMEOFF_LABEL,
  formatDate,
  daysBetween,
} from "./types";

export function VacationsTab({
  timeOff,
  hasAccount,
}: {
  timeOff: TimeOffRecord[];
  hasAccount: boolean;
}) {
  const stats = useMemo(() => {
    const year = new Date().getFullYear();
    const now = Date.now();
    const inYear = (r: TimeOffRecord) =>
      new Date(r.startDate).getFullYear() === year;
    let usedVacation = 0;
    let plannedVacation = 0;
    let sickDays = 0;
    for (const r of timeOff) {
      const days = daysBetween(r.startDate, r.endDate) ?? 0;
      if (r.type === "VACATION") {
        const isPast = new Date(r.endDate).getTime() < now;
        if (r.approvedAt && isPast && inYear(r)) usedVacation += days;
        else if (inYear(r)) plannedVacation += days;
      } else if (r.type === "SICK" && inYear(r)) {
        sickDays += days;
      }
    }
    return { usedVacation, plannedVacation, sickDays };
  }, [timeOff]);

  const sorted = useMemo(
    () =>
      [...timeOff].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      ),
    [timeOff],
  );

  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <KpiCard label="Залишок днів" value="—" accent />
        <KpiCard label="Використано у році" value={stats.usedVacation || "—"} />
        <KpiCard label="Заплановано" value={stats.plannedVacation || "—"} />
        <KpiCard label="Лікарняних у році" value={stats.sickDays || "—"} />
      </div>

      <Divider />

      {sorted.length === 0 ? (
        <div className="py-9 text-center text-[14px]" style={{ color: P.text2 }}>
          {hasAccount
            ? "Записів про відпустки чи лікарняні ще немає."
            : "Немає прив’язаного акаунта — відпустки не ведуться."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Тип", "З", "По", "Днів", "Статус", "Коментар"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-2 py-1.5 text-left font-medium"
                    style={{ color: P.text2, borderBottom: `0.5px solid ${P.border}` }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const days = daysBetween(r.startDate, r.endDate);
                const approved = !!r.approvedAt;
                return (
                  <tr key={r.id} style={{ borderBottom: idx === sorted.length - 1 ? "none" : `0.5px solid ${P.border}` }}>
                    <td className="whitespace-nowrap px-2 py-1.5" style={{ color: P.text }}>
                      {TIMEOFF_LABEL[r.type]}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5" style={{ color: P.text }}>
                      {formatDate(r.startDate)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5" style={{ color: P.text }}>
                      {formatDate(r.endDate)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums" style={{ color: P.text }}>
                      {days ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {approved ? (
                        <Badge bg={P.activeBg} fg={P.activeFg}>Затверджено</Badge>
                      ) : (
                        <Badge bg={P.plannedBg} fg={P.plannedFg}>Заплановано</Badge>
                      )}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: P.text2 }}>
                      {r.notes || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
