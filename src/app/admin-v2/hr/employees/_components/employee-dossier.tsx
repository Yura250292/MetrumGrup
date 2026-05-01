"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Clock,
  ExternalLink,
  ListChecks,
  Loader2,
  Pencil,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type ProjectRole =
  | "PROJECT_ADMIN"
  | "PROJECT_MANAGER"
  | "ENGINEER"
  | "FOREMAN"
  | "FINANCE"
  | "PROCUREMENT"
  | "VIEWER";

type ProjectStatus = "DRAFT" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";

type ProjectStage =
  | "DESIGN"
  | "FOUNDATION"
  | "WALLS"
  | "ROOF"
  | "ENGINEERING"
  | "FINISHING"
  | "HANDOVER";

type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type StageStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

type Engagement = {
  projects: Array<{
    roleInProject: ProjectRole;
    joinedAt: string;
    project: {
      id: string;
      title: string;
      slug: string;
      status: ProjectStatus;
      startDate: string | null;
      expectedEndDate: string | null;
      currentStage: ProjectStage;
    };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: TaskPriority;
    startDate: string | null;
    dueDate: string | null;
    project: { id: string; title: string; slug: string };
    status: { name: string; color: string | null; isDone: boolean };
    stage: { stage: ProjectStage | null; customName: string | null } | null;
  }>;
  stages: Array<{
    id: string;
    stage: ProjectStage | null;
    customName: string | null;
    status: StageStatus;
    progress: number;
    startDate: string | null;
    endDate: string | null;
    project: { id: string; title: string; slug: string };
  }>;
  hoursByProject: Array<{
    projectId: string;
    title: string;
    slug: string;
    status: ProjectStatus;
    hours: number;
  }>;
};

const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  PROJECT_ADMIN: "Адмін проєкту",
  PROJECT_MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FOREMAN: "Виконроб",
  FINANCE: "Фінансист",
  PROCUREMENT: "Постачання",
  VIEWER: "Спостерігач",
};

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "Чернетка",
  ACTIVE: "Активний",
  ON_HOLD: "На паузі",
  COMPLETED: "Завершений",
  CANCELLED: "Скасований",
};

const STAGE_LABEL: Record<ProjectStage, string> = {
  DESIGN: "Проєктування",
  FOUNDATION: "Фундамент",
  WALLS: "Стіни",
  ROOF: "Дах",
  ENGINEERING: "Інженерія",
  FINISHING: "Опорядження",
  HANDOVER: "Здача",
};

const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  PENDING: "Очікує",
  IN_PROGRESS: "В роботі",
  COMPLETED: "Готово",
};

const PRIORITY_TONE: Record<TaskPriority, { bg: string; fg: string; label: string }> = {
  LOW: { bg: T.panelSoft, fg: T.textMuted, label: "Низький" },
  NORMAL: { bg: T.skySoft, fg: T.sky, label: "Звичайний" },
  HIGH: { bg: T.amberSoft, fg: T.amber, label: "Високий" },
  URGENT: { bg: T.dangerSoft, fg: T.danger, label: "Терміново" },
};

type SalaryType = "MONTHLY" | "HOURLY";

type Employee = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  birthDate: string | null;
  residence: string | null;
  maritalStatus: string | null;
  hiredAt: string | null;
  terminatedAt: string | null;
  salaryType: SalaryType | null;
  salaryAmount: number | string | null;
  burdenMultiplier: number | string | null;
  currency: string;
  extraData: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FieldKey =
  | "fullName"
  | "position"
  | "phone"
  | "email"
  | "birthDate"
  | "residence"
  | "maritalStatus"
  | "hiredAt"
  | "terminatedAt"
  | "salaryType"
  | "salaryAmount"
  | "extraData"
  | "notes"
  | "isActive";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uk-UA");
}

function calcAge(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function formatTenure(hired: string | null, terminated: string | null): string | null {
  if (!hired) return null;
  const start = new Date(hired);
  const end = terminated ? new Date(terminated) : new Date();
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (months < 1) return "< 1 міс";
  if (months < 12) return `${months} міс`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} р ${rem} міс` : `${years} р`;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function EmployeeDossier({
  id,
  currentUserRole,
}: {
  id: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [savingField, setSavingField] = useState<FieldKey | null>(null);

  const canEdit = ["SUPER_ADMIN", "MANAGER", "HR"].includes(currentUserRole);
  const canDelete = ["SUPER_ADMIN", "MANAGER"].includes(currentUserRole);
  const canSeeSalary = currentUserRole !== "HR";

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Помилка");
      }
      const j = await res.json();
      setEmployee(j.data);
      setEngagement(j.engagement ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patchField(field: FieldKey, value: unknown) {
    if (!employee) return;
    const current = employee[field];
    if (current === value) {
      setEditingField(null);
      return;
    }
    setSavingField(field);
    try {
      const res = await fetch(`/api/admin/hr/employees`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Помилка збереження");
        return;
      }
      const j = await res.json();
      setEmployee(j.data);
    } finally {
      setSavingField(null);
      setEditingField(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Видалити співробітника?")) return;
    const res = await fetch(`/api/admin/hr/employees?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/admin-v2/hr/employees");
    }
  }

  const initials = useMemo(() => {
    if (!employee) return "";
    return employee.fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");
  }, [employee]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{ backgroundColor: T.dangerSoft, border: `1px solid ${T.danger}40`, color: T.danger }}
      >
        {error ?? "Не знайдено"}
      </div>
    );
  }

  const age = calcAge(employee.birthDate);
  const tenure = formatTenure(employee.hiredAt, employee.terminatedAt);

  return (
    <div className="flex flex-col gap-4">
      {/* Back link */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin-v2/hr/employees"
          className="flex items-center gap-1.5 text-[12px] hover:underline"
          style={{ color: T.textSecondary }}
        >
          <ArrowLeft size={14} />
          До списку співробітників
        </Link>
      </div>

      {/* Slim header */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold"
          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          {initials || <Users size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold" style={{ color: T.textPrimary }}>
              {employee.fullName}
            </h1>
            {employee.position && (
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
              >
                {employee.position}
              </span>
            )}
            {!employee.isActive && (
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
                style={{ backgroundColor: T.dangerSoft, color: T.danger }}
              >
                Неактивний
              </span>
            )}
          </div>
          <div
            className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]"
            style={{ color: T.textMuted }}
          >
            {age !== null && <span>{age} р</span>}
            {tenure && <span>· стаж {tenure}</span>}
          </div>
        </div>
        {canDelete && (
          <button
            onClick={handleDelete}
            className="rounded-xl px-3 py-2 text-[12px] font-semibold"
            style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            title="Видалити"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Property table */}
      <div
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
          <tbody>
            <PropertyRow
              label="ПІБ"
              field="fullName"
              editing={editingField === "fullName"}
              saving={savingField === "fullName"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("fullName")}
              onCommit={(v) => patchField("fullName", (v as string).trim() || employee.fullName)}
              onCancel={() => setEditingField(null)}
              renderValue={() => <span className="font-medium">{employee.fullName}</span>}
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.fullName}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Посада"
              field="position"
              editing={editingField === "position"}
              saving={savingField === "position"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("position")}
              onCommit={(v) => patchField("position", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => textOrDash(employee.position)}
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.position ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Телефон"
              field="phone"
              editing={editingField === "phone"}
              saving={savingField === "phone"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("phone")}
              onCommit={(v) => patchField("phone", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() =>
                employee.phone ? (
                  <a href={`tel:${employee.phone}`} className="hover:underline" style={{ color: T.textSecondary }}>
                    {employee.phone}
                  </a>
                ) : (
                  textOrDash(null)
                )
              }
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.phone ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Email"
              field="email"
              editing={editingField === "email"}
              saving={savingField === "email"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("email")}
              onCommit={(v) => patchField("email", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() =>
                employee.email ? (
                  <a href={`mailto:${employee.email}`} className="hover:underline" style={{ color: T.textSecondary }}>
                    {employee.email}
                  </a>
                ) : (
                  textOrDash(null)
                )
              }
              renderEditor={(stop) => (
                <TextEditor
                  type="email"
                  initial={employee.email ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Дата народження"
              field="birthDate"
              editing={editingField === "birthDate"}
              saving={savingField === "birthDate"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("birthDate")}
              onCommit={(v) => patchField("birthDate", (v as string) || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => (
                <span style={{ color: T.textSecondary }}>
                  {formatDate(employee.birthDate)}
                  {age !== null && employee.birthDate && (
                    <span className="ml-2 text-[11px]" style={{ color: T.textMuted }}>
                      ({age} р)
                    </span>
                  )}
                </span>
              )}
              renderEditor={(stop) => (
                <TextEditor
                  type="date"
                  initial={toDateInput(employee.birthDate)}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Сімейний стан"
              field="maritalStatus"
              editing={editingField === "maritalStatus"}
              saving={savingField === "maritalStatus"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("maritalStatus")}
              onCommit={(v) => patchField("maritalStatus", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => textOrDash(employee.maritalStatus)}
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.maritalStatus ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Місце проживання"
              field="residence"
              editing={editingField === "residence"}
              saving={savingField === "residence"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("residence")}
              onCommit={(v) => patchField("residence", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => textOrDash(employee.residence)}
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.residence ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Прийнятий"
              field="hiredAt"
              editing={editingField === "hiredAt"}
              saving={savingField === "hiredAt"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("hiredAt")}
              onCommit={(v) => patchField("hiredAt", (v as string) || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => (
                <span style={{ color: T.textSecondary }}>
                  {formatDate(employee.hiredAt)}
                  {tenure && (
                    <span className="ml-2 text-[11px]" style={{ color: T.textMuted }}>
                      (стаж {tenure})
                    </span>
                  )}
                </span>
              )}
              renderEditor={(stop) => (
                <TextEditor
                  type="date"
                  initial={toDateInput(employee.hiredAt)}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Звільнений"
              field="terminatedAt"
              editing={editingField === "terminatedAt"}
              saving={savingField === "terminatedAt"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("terminatedAt")}
              onCommit={(v) => patchField("terminatedAt", (v as string) || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => (
                <span style={{ color: T.textSecondary }}>{formatDate(employee.terminatedAt)}</span>
              )}
              renderEditor={(stop) => (
                <TextEditor
                  type="date"
                  initial={toDateInput(employee.terminatedAt)}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            {canSeeSalary && (
              <>
                <PropertyRow
                  label="Тип ЗП"
                  field="salaryType"
                  editing={editingField === "salaryType"}
                  saving={savingField === "salaryType"}
                  canEdit={canEdit}
                  onStartEdit={() => setEditingField("salaryType")}
                  onCommit={(v) => patchField("salaryType", v)}
                  onCancel={() => setEditingField(null)}
                  renderValue={() => (
                    <span style={{ color: T.textSecondary }}>
                      {employee.salaryType === "HOURLY" ? "Погодинна" : "Місячна"}
                    </span>
                  )}
                  renderEditor={(stop) => (
                    <select
                      autoFocus
                      defaultValue={employee.salaryType ?? "MONTHLY"}
                      onChange={(e) => stop(e.target.value as SalaryType)}
                      onBlur={(e) => stop(e.target.value as SalaryType)}
                      className="rounded-lg px-2 py-1 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelSoft,
                        border: `1px solid ${T.borderStrong}`,
                        color: T.textPrimary,
                      }}
                    >
                      <option value="MONTHLY">Місячна</option>
                      <option value="HOURLY">Погодинна</option>
                    </select>
                  )}
                />
                <PropertyRow
                  label={employee.salaryType === "HOURLY" ? "Ставка / год, ₴" : "ЗП на місяць, ₴"}
                  field="salaryAmount"
                  editing={editingField === "salaryAmount"}
                  saving={savingField === "salaryAmount"}
                  canEdit={canEdit}
                  onStartEdit={() => setEditingField("salaryAmount")}
                  onCommit={(v) => {
                    const num = v === "" || v === null ? null : Number(v);
                    if (num !== null && !Number.isFinite(num)) {
                      setEditingField(null);
                      return;
                    }
                    void patchField("salaryAmount", num);
                  }}
                  onCancel={() => setEditingField(null)}
                  renderValue={() => (
                    <span className="tabular-nums font-semibold" style={{ color: T.textPrimary }}>
                      {employee.salaryAmount != null
                        ? `${formatCurrency(Number(employee.salaryAmount))}${
                            employee.salaryType === "HOURLY" ? " /год" : " /міс"
                          }`
                        : "—"}
                    </span>
                  )}
                  renderEditor={(stop) => (
                    <TextEditor
                      type="number"
                      initial={employee.salaryAmount != null ? String(employee.salaryAmount) : ""}
                      onCommit={(v) => stop(v)}
                      onCancel={() => stop(undefined)}
                    />
                  )}
                />
              </>
            )}
            <PropertyRow
              label="Додаткові дані"
              field="extraData"
              editing={editingField === "extraData"}
              saving={savingField === "extraData"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("extraData")}
              onCommit={(v) => patchField("extraData", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => textOrDash(employee.extraData)}
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.extraData ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Нотатки"
              field="notes"
              editing={editingField === "notes"}
              saving={savingField === "notes"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("notes")}
              onCommit={(v) => patchField("notes", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => textOrDash(employee.notes)}
              renderEditor={(stop) => (
                <TextareaEditor
                  initial={employee.notes ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Активний"
              field="isActive"
              editing={false}
              saving={savingField === "isActive"}
              canEdit={canEdit}
              onStartEdit={() => {
                if (savingField) return;
                void patchField("isActive", !employee.isActive);
              }}
              onCommit={() => undefined}
              onCancel={() => undefined}
              renderValue={() => (
                <span style={{ color: employee.isActive ? T.success : T.textMuted }}>
                  {employee.isActive ? "Так" : "Ні"}
                </span>
              )}
              renderEditor={() => null}
            />
          </tbody>
        </table>
      </div>

      {engagement && <EngagementPanel data={engagement} />}

      <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: T.textMuted }}>
        <span>Створено: {formatDate(employee.createdAt)}</span>
        <span>·</span>
        <span>Оновлено: {formatDate(employee.updatedAt)}</span>
      </div>
    </div>
  );
}

function EngagementPanel({ data }: { data: Engagement }) {
  const { projects, tasks, stages, hoursByProject } = data;
  const isEmpty =
    projects.length === 0 &&
    tasks.length === 0 &&
    stages.length === 0 &&
    hoursByProject.length === 0;

  if (isEmpty) {
    return (
      <div
        className="rounded-2xl px-4 py-6 text-center text-[13px]"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        За останні 30 днів не задіяний у жодному проєкті, задачі чи етапі.
      </div>
    );
  }

  const hoursTotal = hoursByProject.reduce((s, h) => s + h.hours, 0);
  const overdueTasks = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).getTime() < Date.now(),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="Активні проєкти"
          value={projects.length}
          icon={<Briefcase size={12} />}
        />
        <StatCard
          label="Етапів на відповідальності"
          value={stages.length}
          icon={<Target size={12} />}
        />
        <StatCard
          label="Поточні задачі"
          value={tasks.length}
          icon={<ListChecks size={12} />}
          subline={
            overdueTasks > 0 ? (
              <span style={{ color: T.danger }}>
                {overdueTasks} прострочено
              </span>
            ) : undefined
          }
        />
        <StatCard
          label="Годин за 30 днів"
          value={hoursTotal.toFixed(1)}
          icon={<Clock size={12} />}
          subline={
            hoursByProject.length > 1 ? (
              <span style={{ color: T.textMuted }}>
                на {hoursByProject.length} проєктах
              </span>
            ) : undefined
          }
        />
      </div>

      {projects.length > 0 && (
        <Section title="Активні проєкти">
          <table className="w-full text-[13px]">
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              >
                <th className="px-4 py-2.5 text-left">Проєкт</th>
                <th className="px-3 py-2.5 text-left">Роль</th>
                <th className="px-3 py-2.5 text-left">Етап</th>
                <th className="px-3 py-2.5 text-left">Старт</th>
                <th className="px-3 py-2.5 text-left">Дедлайн</th>
                <th className="px-3 py-2.5 text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((m, idx) => {
                const overdue =
                  m.project.expectedEndDate &&
                  new Date(m.project.expectedEndDate).getTime() < Date.now();
                return (
                  <tr
                    key={m.project.id + idx}
                    className="border-t"
                    style={{ borderColor: T.borderSoft }}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin-v2/projects/${m.project.slug}`}
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                        style={{ color: T.accentPrimary }}
                      >
                        {m.project.title}
                        <ExternalLink size={11} />
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {PROJECT_ROLE_LABEL[m.roleInProject]}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {STAGE_LABEL[m.project.currentStage]}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap" style={{ color: T.textSecondary }}>
                      {formatDate(m.project.startDate)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[12px] whitespace-nowrap"
                      style={{ color: overdue ? T.danger : T.textSecondary }}
                    >
                      {formatDate(m.project.expectedEndDate)}
                      {overdue && (
                        <AlertTriangle size={11} className="inline ml-1 -mt-0.5" />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ProjectStatusBadge status={m.project.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {stages.length > 0 && (
        <Section title="Відповідальний за етапи">
          <table className="w-full text-[13px]">
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              >
                <th className="px-4 py-2.5 text-left">Проєкт</th>
                <th className="px-3 py-2.5 text-left">Етап</th>
                <th className="px-3 py-2.5 text-left">Старт</th>
                <th className="px-3 py-2.5 text-left">Завершення</th>
                <th className="px-3 py-2.5 text-left">Прогрес</th>
                <th className="px-3 py-2.5 text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const overdue =
                  s.endDate && new Date(s.endDate).getTime() < Date.now() && s.status !== "COMPLETED";
                return (
                  <tr key={s.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin-v2/projects/${s.project.slug}`}
                        className="hover:underline"
                        style={{ color: T.accentPrimary }}
                      >
                        {s.project.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {s.customName ?? (s.stage ? STAGE_LABEL[s.stage] : "—")}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap" style={{ color: T.textSecondary }}>
                      {formatDate(s.startDate)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[12px] whitespace-nowrap"
                      style={{ color: overdue ? T.danger : T.textSecondary }}
                    >
                      {formatDate(s.endDate)}
                      {overdue && <AlertTriangle size={11} className="inline ml-1 -mt-0.5" />}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 w-20 overflow-hidden rounded-full"
                          style={{ backgroundColor: T.panelSoft }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(0, Math.min(100, s.progress))}%`,
                              backgroundColor: T.accentPrimary,
                            }}
                          />
                        </div>
                        <span className="tabular-nums">{s.progress}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StageStatusBadge status={s.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {tasks.length > 0 && (
        <Section title="Поточні задачі">
          <table className="w-full text-[13px]">
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              >
                <th className="px-4 py-2.5 text-left">Задача</th>
                <th className="px-3 py-2.5 text-left">Проєкт</th>
                <th className="px-3 py-2.5 text-left">Етап</th>
                <th className="px-3 py-2.5 text-left">Пріоритет</th>
                <th className="px-3 py-2.5 text-left">Старт</th>
                <th className="px-3 py-2.5 text-left">Дедлайн</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const overdue = t.dueDate && new Date(t.dueDate).getTime() < Date.now();
                return (
                  <tr key={t.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium" style={{ color: T.textPrimary }}>
                        {t.title}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      <Link
                        href={`/admin-v2/projects/${t.project.slug}`}
                        className="hover:underline"
                        style={{ color: T.accentPrimary }}
                      >
                        {t.project.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {t.stage?.customName ??
                        (t.stage?.stage ? STAGE_LABEL[t.stage.stage] : "—")}
                    </td>
                    <td className="px-3 py-2.5">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap" style={{ color: T.textSecondary }}>
                      {formatDate(t.startDate)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[12px] whitespace-nowrap"
                      style={{ color: overdue ? T.danger : T.textSecondary }}
                    >
                      {formatDate(t.dueDate)}
                      {overdue && <AlertTriangle size={11} className="inline ml-1 -mt-0.5" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {hoursByProject.length > 0 && (
        <Section title="Години роботи (30 днів)">
          <table className="w-full text-[13px]">
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              >
                <th className="px-4 py-2.5 text-left">Проєкт</th>
                <th className="px-3 py-2.5 text-right">Годин</th>
                <th className="px-3 py-2.5 text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {hoursByProject
                .slice()
                .sort((a, b) => b.hours - a.hours)
                .map((h) => (
                  <tr key={h.projectId} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin-v2/projects/${h.slug}`}
                        className="hover:underline"
                        style={{ color: T.accentPrimary }}
                      >
                        {h.title}
                      </Link>
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums font-semibold"
                      style={{ color: T.textPrimary }}
                    >
                      {h.hours.toFixed(1)} год
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ProjectStatusBadge status={h.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
    >
      <div
        className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: T.textSecondary, backgroundColor: T.panelSoft, borderBottom: `1px solid ${T.borderSoft}` }}
      >
        {title}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  subline,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  subline?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-base font-bold tabular-nums sm:text-lg" style={{ color: T.textPrimary }}>
        {value}
      </div>
      {subline && <div className="mt-0.5 text-[11px]">{subline}</div>}
    </div>
  );
}

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const tone =
    status === "ACTIVE"
      ? { bg: T.successSoft, fg: T.success }
      : status === "ON_HOLD"
      ? { bg: T.warningSoft, fg: T.warning }
      : status === "COMPLETED"
      ? { bg: T.skySoft, fg: T.sky }
      : status === "CANCELLED"
      ? { bg: T.dangerSoft, fg: T.danger }
      : { bg: T.panelSoft, fg: T.textMuted };
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {PROJECT_STATUS_LABEL[status]}
    </span>
  );
}

function StageStatusBadge({ status }: { status: StageStatus }) {
  const tone =
    status === "IN_PROGRESS"
      ? { bg: T.accentPrimarySoft, fg: T.accentPrimary }
      : status === "COMPLETED"
      ? { bg: T.successSoft, fg: T.success }
      : { bg: T.panelSoft, fg: T.textMuted };
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {STAGE_STATUS_LABEL[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const tone = PRIORITY_TONE[priority];
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}

function textOrDash(v: string | null) {
  return v ? (
    <span style={{ color: T.textSecondary }}>{v}</span>
  ) : (
    <span style={{ color: T.textMuted }}>—</span>
  );
}

function PropertyRow({
  label,
  renderValue,
  renderEditor,
  editing,
  saving,
  canEdit,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  label: string;
  field: FieldKey;
  renderValue: () => React.ReactNode;
  renderEditor: (stop: (next: unknown | undefined) => void) => React.ReactNode;
  editing: boolean;
  saving: boolean;
  canEdit: boolean;
  onStartEdit: () => void;
  onCommit: (v: unknown) => void;
  onCancel: () => void;
}) {
  function stop(next: unknown | undefined) {
    if (next === undefined) {
      onCancel();
    } else {
      onCommit(next);
    }
  }
  return (
    <tr className="border-t" style={{ borderColor: T.borderSoft }}>
      <th
        scope="row"
        className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider align-middle w-[200px]"
        style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
      >
        {label}
      </th>
      <td
        className={`px-3 py-2.5 align-middle ${canEdit ? "cursor-pointer hover:bg-black/5" : ""}`}
        onClick={() => {
          if (!canEdit || editing || saving) return;
          onStartEdit();
        }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {editing ? renderEditor(stop) : renderValue()}
          </div>
          {saving && <Loader2 size={12} className="animate-spin" style={{ color: T.textMuted }} />}
          {!editing && !saving && canEdit && (
            <Pencil size={11} className="opacity-30" style={{ color: T.textMuted }} />
          )}
        </div>
      </td>
    </tr>
  );
}

function TextEditor({
  initial,
  type = "text",
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  type?: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      type={type}
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="w-full rounded-lg px-2 py-1 text-sm outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    />
  );
}

function TextareaEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <textarea
      autoFocus
      rows={3}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="w-full rounded-lg px-2 py-1.5 text-sm outline-none resize-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    />
  );
}
