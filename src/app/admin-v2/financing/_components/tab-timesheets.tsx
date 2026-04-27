"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
  PlayCircle,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import type { ProjectOption } from "./types";

type Person = { id: string; name: string; role: string | null; defaultHourlyRate: number | null };

type Timesheet = {
  id: string;
  employeeId: string | null;
  workerId: string | null;
  projectId: string;
  costCodeId: string | null;
  date: string;
  hours: number | string;
  hourlyRate: number | string;
  amount: number | string;
  approvedAt: string | null;
  financeEntryId: string | null;
  employee: { id: string; fullName: string; position: string | null } | null;
  worker: { id: string; name: string; specialty: string } | null;
  project: { id: string; title: string };
  costCode: { id: string; code: string; name: string } | null;
};

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  r.setDate(r.getDate() - ((day + 6) % 7));
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function TabTimesheets({
  scope,
  projects,
  currentUserRole,
}: {
  scope?: { id: string; title: string };
  projects: ProjectOption[];
  currentUserRole?: string;
}) {
  const canApprove = ["SUPER_ADMIN", "MANAGER", "FINANCIER"].includes(currentUserRole ?? "");

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(scope?.id ?? null);
  const [employees, setEmployees] = useState<Person[]>([]);
  const [workers, setWorkers] = useState<Person[]>([]);
  const [costCodes, setCostCodes] = useState<{ id: string; code: string; name: string; depth: number }[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id?: string;
    personId: string;
    personType: "employee" | "worker";
    date: string;
    hours: number;
    hourlyRate: number;
    costCodeId: string | null;
    notes: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningPayroll, setRunningPayroll] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const projectOptions: ComboboxOption[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.title })),
    [projects],
  );
  const costCodeOptions: ComboboxOption[] = useMemo(
    () => costCodes.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` })),
    [costCodes],
  );

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [peopleRes, ccRes] = await Promise.all([
          fetch("/api/admin/financing/timesheets/people", { cache: "no-store" }),
          fetch("/api/admin/financing/cost-codes", { cache: "no-store" }),
        ]);
        if (alive && peopleRes.ok) {
          const j = await peopleRes.json();
          setEmployees(j.employees ?? []);
          setWorkers(j.workers ?? []);
        }
        if (alive && ccRes.ok) {
          const j = await ccRes.json();
          setCostCodes(j.data ?? []);
        }
      } catch {
        /* silent */
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const fromIso = useMemo(() => weekStart.toISOString().slice(0, 10), [weekStart]);
  const toIso = useMemo(() => addDays(weekStart, 6).toISOString().slice(0, 10), [weekStart]);

  async function loadSheets() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("from", fromIso);
      params.set("to", toIso);
      if (selectedProjectId) params.set("projectId", selectedProjectId);
      const res = await fetch(`/api/admin/financing/timesheets?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Помилка");
      }
      const j = await res.json();
      setTimesheets(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, selectedProjectId]);

  // Build matrix: personKey → { day → cellInfo }
  const matrix = useMemo(() => {
    const byPerson = new Map<
      string,
      {
        person: Person;
        type: "employee" | "worker";
        days: Map<string, Timesheet[]>;
        totalHours: number;
        totalAmount: number;
      }
    >();

    function bumpPerson(personId: string, type: "employee" | "worker") {
      const k = `${type}:${personId}`;
      if (byPerson.has(k)) return byPerson.get(k)!;
      const list = type === "employee" ? employees : workers;
      const person = list.find((p) => p.id === personId);
      if (!person) return null;
      const entry = {
        person,
        type,
        days: new Map<string, Timesheet[]>(),
        totalHours: 0,
        totalAmount: 0,
      };
      byPerson.set(k, entry);
      return entry;
    }

    for (const t of timesheets) {
      const personId = t.employeeId ?? t.workerId;
      const type = t.employeeId ? "employee" : "worker";
      if (!personId) continue;
      const entry = bumpPerson(personId, type);
      if (!entry) continue;
      const k = t.date.slice(0, 10);
      if (!entry.days.has(k)) entry.days.set(k, []);
      entry.days.get(k)!.push(t);
      entry.totalHours += Number(t.hours);
      entry.totalAmount += Number(t.amount);
    }

    return Array.from(byPerson.values()).sort((a, b) =>
      a.person.name.localeCompare(b.person.name, "uk"),
    );
  }, [timesheets, employees, workers]);

  const unapprovedIds = useMemo(
    () => timesheets.filter((t) => !t.approvedAt && !t.financeEntryId).map((t) => t.id),
    [timesheets],
  );

  async function bulkApprove() {
    if (unapprovedIds.length === 0) return;
    if (!confirm(`Підтвердити ${unapprovedIds.length} табел${unapprovedIds.length === 1 ? "ь" : "і"}?`)) return;
    const res = await fetch("/api/admin/financing/timesheets/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unapprovedIds, approve: true }),
    });
    if (res.ok) await loadSheets();
  }

  async function runPayroll() {
    if (!confirm("Сформувати ЗП-операції з затверджених табелів?")) return;
    setRunningPayroll(true);
    try {
      const year = weekStart.getFullYear();
      const month = weekStart.getMonth() + 1;
      const res = await fetch("/api/admin/financing/payroll/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          mode: "timesheet",
          kind: "FACT",
          status: "DRAFT",
          ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? "Помилка нарахування");
      } else {
        const created = Array.isArray(j.created) ? j.created.length : 0;
        alert(`Створено ${created} ЗП-операцій. Табелі помічено як зведені.`);
        await loadSheets();
      }
    } finally {
      setRunningPayroll(false);
    }
  }

  function openEditor(personId: string, type: "employee" | "worker", date: Date, existing?: Timesheet) {
    const list = type === "employee" ? employees : workers;
    const person = list.find((p) => p.id === personId);
    setEditing({
      id: existing?.id,
      personId,
      personType: type,
      date: dayKey(date),
      hours: existing ? Number(existing.hours) : 8,
      hourlyRate: existing ? Number(existing.hourlyRate) : person?.defaultHourlyRate ?? 0,
      costCodeId: existing?.costCodeId ?? null,
      notes: "",
    });
  }

  async function saveEntry() {
    if (!editing) return;
    if (!selectedProjectId) {
      alert("Спочатку виберіть проєкт");
      return;
    }
    setSaving(true);
    try {
      const url = editing.id
        ? `/api/admin/financing/timesheets/${editing.id}`
        : "/api/admin/financing/timesheets";
      const method = editing.id ? "PATCH" : "POST";
      const body = editing.id
        ? {
            hours: editing.hours,
            hourlyRate: editing.hourlyRate,
            costCodeId: editing.costCodeId,
          }
        : {
            employeeId: editing.personType === "employee" ? editing.personId : null,
            workerId: editing.personType === "worker" ? editing.personId : null,
            projectId: selectedProjectId,
            date: editing.date,
            hours: editing.hours,
            hourlyRate: editing.hourlyRate,
            costCodeId: editing.costCodeId,
            costType: "LABOR",
            notes: editing.notes || null,
          };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Помилка");
        return;
      }
      setEditing(null);
      await loadSheets();
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Видалити табель?")) return;
    const res = await fetch(`/api/admin/financing/timesheets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Помилка");
      return;
    }
    await loadSheets();
  }

  const totalHours = matrix.reduce((s, m) => s + m.totalHours, 0);
  const totalAmount = matrix.reduce((s, m) => s + m.totalAmount, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-2">
        {!scope && (
          <div className="flex-1 min-w-[200px]">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
              Проєкт
            </span>
            <Combobox
              value={selectedProjectId}
              options={projectOptions}
              onChange={(id) => setSelectedProjectId(id)}
              placeholder="Виберіть проєкт…"
              searchPlaceholder="Пошук проєкту…"
              emptyMessage="Проєкти відсутні"
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 rounded-xl px-2 py-1.5"
          style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}>
          <button
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            className="rounded-md p-1.5 hover:bg-black/5"
            aria-label="Попередній тиждень"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
            {format(weekStart, "d MMM", { locale: uk })} – {format(addDays(weekStart, 6), "d MMM yyyy", { locale: uk })}
          </span>
          <button
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            className="rounded-md p-1.5 hover:bg-black/5"
            aria-label="Наступний тиждень"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="ml-1 rounded-md px-2 py-1 text-[11px] font-semibold hover:bg-black/5"
            style={{ color: T.textSecondary }}
          >
            Сьогодні
          </button>
        </div>

        <button
          onClick={() => loadSheets()}
          disabled={loading}
          className="rounded-xl px-3 py-2.5 text-[12px] font-semibold disabled:opacity-50"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderSoft}`,
            color: T.textSecondary,
          }}
        >
          <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
        </button>

        <div className="flex-1" />

        {canApprove && unapprovedIds.length > 0 && (
          <button
            onClick={bulkApprove}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold"
            style={{ backgroundColor: T.success, color: "#fff" }}
          >
            <CheckCircle2 size={13} /> Підтвердити {unapprovedIds.length}
          </button>
        )}

        {canApprove && (
          <button
            onClick={runPayroll}
            disabled={runningPayroll}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            {runningPayroll ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
            Сформувати ЗП
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: T.dangerSoft, border: `1px solid ${T.danger}40`, color: T.danger }}>
          {error}
        </div>
      )}

      {!selectedProjectId && (
        <div className="rounded-2xl px-6 py-12 text-center text-sm"
          style={{ backgroundColor: T.panelSoft, border: `1px dashed ${T.borderStrong}`, color: T.textMuted }}>
          Виберіть проєкт, щоб вести табелі по ньому.
        </div>
      )}

      {selectedProjectId && (
        <div className="overflow-x-auto rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}>
          <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}>
                <th className="sticky left-0 px-4 py-3 text-left" style={{ backgroundColor: T.panelSoft }}>
                  Працівник
                </th>
                {weekDays.map((d) => (
                  <th key={dayKey(d)} className="px-2 py-3 text-center min-w-[78px]">
                    <div>{format(d, "EEEEEE", { locale: uk })}</div>
                    <div className="text-[11px] font-normal opacity-70">{format(d, "d.MM")}</div>
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Год.</th>
                <th className="px-3 py-3 text-right">Сума</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={`${row.type}:${row.person.id}`} className="border-t" style={{ borderColor: T.borderSoft }}>
                  <td className="sticky left-0 px-4 py-2.5" style={{ backgroundColor: T.panel }}>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
                        style={{
                          backgroundColor: row.type === "employee" ? T.skySoft : T.amberSoft,
                          color: row.type === "employee" ? T.sky : T.amber,
                        }}>
                        {row.type === "employee" ? "ШТАТ" : "ПІДРЯД"}
                      </span>
                      <div>
                        <div className="font-medium">{row.person.name}</div>
                        {row.person.role && (
                          <div className="text-[10px]" style={{ color: T.textMuted }}>
                            {row.person.role}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {weekDays.map((d) => {
                    const sheets = row.days.get(dayKey(d)) ?? [];
                    const hours = sheets.reduce((s, t) => s + Number(t.hours), 0);
                    const allLocked = sheets.length > 0 && sheets.every((t) => t.financeEntryId);
                    const hasUnapproved = sheets.some((t) => !t.approvedAt);
                    return (
                      <td key={dayKey(d)} className="px-1.5 py-2 text-center">
                        {sheets.length > 0 ? (
                          <button
                            onClick={() => openEditor(row.person.id, row.type, d, sheets[0])}
                            disabled={allLocked}
                            className="w-full rounded-lg px-2 py-1.5 text-[12px] font-semibold transition disabled:cursor-default"
                            style={{
                              backgroundColor: allLocked
                                ? T.successSoft
                                : hasUnapproved
                                ? T.warningSoft
                                : T.accentPrimarySoft,
                              color: allLocked ? T.success : hasUnapproved ? T.warning : T.accentPrimary,
                            }}
                            title={allLocked ? "Включено в ЗП" : hasUnapproved ? "Не апрувлено" : "Апрувлено"}
                          >
                            {hours.toFixed(1)}
                            {sheets.length > 1 && <span className="ml-0.5 text-[9px]">×{sheets.length}</span>}
                          </button>
                        ) : (
                          <button
                            onClick={() => openEditor(row.person.id, row.type, d)}
                            className="rounded-md p-1 opacity-30 transition hover:opacity-100"
                            style={{ color: T.textMuted }}
                            aria-label="Додати табель"
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{row.totalHours.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {formatCurrencyCompact(row.totalAmount)}
                  </td>
                </tr>
              ))}
              {matrix.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: T.textMuted }}>
                    Жодного табелю на цей тиждень. Додайте через «+» біля працівника на день.
                  </td>
                </tr>
              )}
            </tbody>
            {matrix.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: T.panelSoft, borderTop: `1px solid ${T.borderStrong}` }}>
                  <td className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: T.textMuted }}>
                    Разом
                  </td>
                  <td colSpan={7} />
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{totalHours.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                    {formatCurrencyCompact(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Add/edit form picker — bottom panel for new rows when no employee yet */}
      {selectedProjectId && (employees.length > 0 || workers.length > 0) && matrix.length === 0 && !loading && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>
            Додати рядок
          </div>
          <div className="flex flex-wrap gap-2">
            {employees.map((e) => (
              <button
                key={`e-${e.id}`}
                onClick={() => openEditor(e.id, "employee", new Date())}
                className="rounded-xl px-3 py-2 text-[12px]"
                style={{ backgroundColor: T.skySoft, color: T.sky, border: `1px solid ${T.sky}40` }}
              >
                + {e.name}
              </button>
            ))}
            {workers.map((w) => (
              <button
                key={`w-${w.id}`}
                onClick={() => openEditor(w.id, "worker", new Date())}
                className="rounded-xl px-3 py-2 text-[12px]"
                style={{ backgroundColor: T.amberSoft, color: T.amber, border: `1px solid ${T.amber}40` }}
              >
                + {w.name} <span className="opacity-60">(підряд)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}>
            <div className="border-b px-5 py-4" style={{ borderColor: T.borderSoft }}>
              <div className="text-[12px] uppercase tracking-wider" style={{ color: T.textMuted }}>
                {editing.id ? "Редагувати табель" : "Новий табель"}
              </div>
              <div className="mt-1 text-base font-bold" style={{ color: T.textPrimary }}>
                {(editing.personType === "employee" ? employees : workers).find((p) => p.id === editing.personId)?.name}
                {" · "}
                {editing.date}
              </div>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Годин">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={editing.hours}
                    onChange={(e) => setEditing((s) => s && { ...s, hours: Number(e.target.value) })}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
                  />
                </Field>
                <Field label="Ставка/год, ₴">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={editing.hourlyRate}
                    onChange={(e) => setEditing((s) => s && { ...s, hourlyRate: Number(e.target.value) })}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
                  />
                </Field>
              </div>
              <Field label="Стаття витрат (cost-code)">
                <Combobox
                  value={editing.costCodeId}
                  options={costCodeOptions}
                  onChange={(id) => setEditing((s) => s && { ...s, costCodeId: id })}
                  placeholder="Виберіть статтю…"
                  searchPlaceholder="Пошук…"
                  emptyMessage="Дерево cost-codes порожнє"
                  listMaxHeight={240}
                />
              </Field>
              <div className="rounded-xl px-3 py-2 text-[12px]"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}>
                Сума: <strong style={{ color: T.textPrimary }}>{formatCurrencyCompact(editing.hours * editing.hourlyRate)}</strong>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: T.borderSoft }}>
              {editing.id && (
                <button
                  onClick={() => editing.id && deleteEntry(editing.id)}
                  className="rounded-xl px-3 py-2 text-[12px] font-semibold"
                  style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                >
                  <Trash2 size={13} />
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setEditing(null)}
                className="rounded-xl px-4 py-2 text-[12px] font-semibold"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                onClick={saveEntry}
                disabled={saving || editing.hours <= 0}
                className="rounded-xl px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : "Зберегти"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}
