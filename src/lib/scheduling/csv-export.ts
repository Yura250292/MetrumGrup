/**
 * CSV serializer для Gantt-задач. Колонки:
 *   id, parentId, title, plannedStart, plannedEnd, actualStart, actualEnd,
 *   progressPercent, depsCSV
 * Розділювач — ";" (Excel UA локаль), text-fields обгорнуті у "".
 */
export type CsvTaskInput = {
  id: string;
  parentId: string | null;
  title: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  progressPercent: number;
  /** Список predecessor task IDs. */
  predecessorIds: string[];
};

const HEADERS = [
  "id",
  "parentId",
  "title",
  "plannedStart",
  "plannedEnd",
  "actualStart",
  "actualEnd",
  "progressPercent",
  "predecessors",
];

function isoDay(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function quote(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export function serializeGanttCsv(tasks: CsvTaskInput[]): string {
  const lines: string[] = [HEADERS.join(";")];
  for (const t of tasks) {
    lines.push(
      [
        quote(t.id),
        quote(t.parentId ?? ""),
        quote(t.title),
        isoDay(t.plannedStart),
        isoDay(t.plannedEnd),
        isoDay(t.actualStart),
        isoDay(t.actualEnd),
        String(Math.round(t.progressPercent)),
        quote(t.predecessorIds.join(",")),
      ].join(";"),
    );
  }
  // UTF-8 BOM щоб Excel UA локаль одразу відкривала без помилок кодування.
  return "﻿" + lines.join("\n") + "\n";
}
