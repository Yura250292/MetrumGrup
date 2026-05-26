/**
 * Serialize Gantt-tasks у Microsoft Project XML 2003 format (subset).
 * Schema: https://learn.microsoft.com/en-us/office-project/xml-data-interchange/microsoft-project-xml-schema-reference
 *
 * Підмножина елементів: Tasks/Task (UID, ID, Name, Start, Finish, Duration,
 * PercentComplete, PredecessorLink). Calendar — порожній (means default 7-day,
 * no holidays — per user preference).
 */
import type { CpmDependencyType } from "./critical-path";

export type MspTaskInput = {
  id: string;
  title: string;
  /** Календарна дата початку (UTC ok, format ISO). */
  start: Date;
  finish: Date;
  /** 0..100. */
  percentComplete: number;
  /** Outline-level (1 = top). За замовчуванням 1. */
  outlineLevel?: number;
};

export type MspDependencyInput = {
  predecessorId: string;
  successorId: string;
  type: CpmDependencyType;
  lagDays: number;
};

/** MS Project encodes link type as integer: 0=FF, 1=FS, 2=SF, 3=SS. */
const LINK_TYPE: Record<CpmDependencyType, number> = {
  FF: 0,
  FS: 1,
  SF: 2,
  SS: 3,
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDateTime(d: Date): string {
  // MSP wants: YYYY-MM-DDTHH:MM:SS (no timezone). Use UTC parts to keep
  // determinism for snapshot tests.
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
  );
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
}

/** Duration у MSP-форматі: "PT<hours>H<mins>M<secs>S" (ISO-8601 з префіксом PT). */
function fmtDuration(days: number): string {
  const hours = Math.max(0, days) * 8; // 8h workday
  return `PT${hours}H0M0S`;
}

/** Lag — теж duration; може бути від'ємний. */
function fmtLag(lagDays: number): string {
  const hours = lagDays * 8;
  return `PT${hours}H0M0S`;
}

/**
 * Серіалізує задачі+залежності у MSP XML 2003.
 * Determistic: tasks ordered за `tasks` argument, deps ordered за `(succUID, predUID)`.
 */
export function serializeMsProjectXml(
  tasks: MspTaskInput[],
  deps: MspDependencyInput[],
  options: { projectTitle?: string; author?: string } = {},
): string {
  // UID = 1-based index. Map id → uid для deps.
  const uidById = new Map<string, number>();
  tasks.forEach((t, i) => uidById.set(t.id, i + 1));

  const projectTitle = esc(options.projectTitle ?? "Metrum project");
  const author = esc(options.author ?? "Metrum Group");

  const tasksXml = tasks
    .map((t, i) => {
      const uid = i + 1;
      const dur = daysBetween(t.start, t.finish);
      const predecessors = deps
        .filter((d) => d.successorId === t.id)
        .sort((a, b) => {
          const ua = uidById.get(a.predecessorId) ?? 0;
          const ub = uidById.get(b.predecessorId) ?? 0;
          return ua - ub;
        })
        .map((d) => {
          const predUid = uidById.get(d.predecessorId);
          if (!predUid) return "";
          return [
            "      <PredecessorLink>",
            `        <PredecessorUID>${predUid}</PredecessorUID>`,
            `        <Type>${LINK_TYPE[d.type]}</Type>`,
            `        <LinkLag>${d.lagDays * 4800}</LinkLag>`,
            // MSP LinkLag is in 1/100-minute units; 4800 = 8h*60min*10 (1d).
            `        <LagFormat>7</LagFormat>`,
            "      </PredecessorLink>",
          ].join("\n");
        })
        .filter(Boolean)
        .join("\n");
      return [
        "    <Task>",
        `      <UID>${uid}</UID>`,
        `      <ID>${uid}</ID>`,
        `      <Name>${esc(t.title)}</Name>`,
        `      <Active>1</Active>`,
        `      <Type>1</Type>`,
        `      <IsNull>0</IsNull>`,
        `      <Start>${fmtDateTime(t.start)}</Start>`,
        `      <Finish>${fmtDateTime(t.finish)}</Finish>`,
        `      <Duration>${fmtDuration(dur)}</Duration>`,
        `      <PercentComplete>${Math.round(t.percentComplete)}</PercentComplete>`,
        `      <OutlineLevel>${t.outlineLevel ?? 1}</OutlineLevel>`,
        predecessors,
        "    </Task>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  void fmtLag; // export-only helper, kept for future expansions

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    `  <Title>${projectTitle}</Title>`,
    `  <Author>${author}</Author>`,
    `  <ScheduleFromStart>1</ScheduleFromStart>`,
    `  <MinutesPerDay>480</MinutesPerDay>`,
    `  <MinutesPerWeek>3360</MinutesPerWeek>`, // 7 days * 8h * 60 min
    `  <DaysPerMonth>30</DaysPerMonth>`,
    "  <Tasks>",
    tasksXml,
    "  </Tasks>",
    "</Project>",
  ].join("\n");
}
