"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  Link2Off,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
  User,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { EmployeeAvatar } from "./employee-avatar";
import { useHideSalaries } from "./use-hide-salaries";
import {
  ROLE_COLORS,
  ROLE_LABELS,
  assignableRolesFor,
  canAssignRole,
} from "@/app/admin-v2/_lib/role-display";

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

type LinkedUser = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  avatar: string | null;
};

type Employee = {
  id: string;
  fullName: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  employeeNumber: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  birthDate: string | null;
  hiredAt: string | null;
  terminatedAt: string | null;
  notes: string | null;
  isActive: boolean;
  employmentType: EmploymentType;
  employmentRate: number | string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  deferralType: DeferralType;
  deferralUntil: string | null;
  userId: string | null;
  user: LinkedUser | null;
  /// Історія ЗП — лише для не-HR. HR отримує [].
  salaries: SalaryPeriod[];
  /// Місячні зарплатні періоди з 1С Excel (повний breakdown). Видно лише SUPER_ADMIN.
  payrollPeriods: PayrollPeriod[];
  createdAt: string;
  updatedAt: string;
};

type PayrollPeriod = {
  id: string;
  period: string;
  isVacation: boolean;
  officialPart: number | string | null;
  pdfo: number | string | null;
  vz: number | string | null;
  esv: number | string | null;
  taxesTotal: number | string | null;
  salaryToCard: number | string | null;
  totalSum: number | string | null;
  advance: number | string | null;
  sickLeave: number | string | null;
  vacationPay: number | string | null;
  bonus: number | string | null;
  metrumExpenses: number | string | null;
  currency: string;
  sourceFile: string | null;
  notes: string | null;
  /** Дата імпорту запису — використовується як «дата закачки» в історії. */
  createdAt: string;
};

type DeferralType = "NONE" | "RESERVATION" | "DEFERMENT";
type EmploymentType = "FULL" | "PART" | "CONTRACT";

type SalaryPeriod = {
  id: string;
  baseSalary: number | string;
  officialPart: number | string | null;
  coefficient: number | string;
  description: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
};

const DEFERRAL_LABEL: Record<DeferralType, string> = {
  NONE: "Відсутня",
  RESERVATION: "Бронювання",
  DEFERMENT: "Відстрочка",
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL: "Повна",
  PART: "Неповна",
  CONTRACT: "Договір",
};

type FieldKey =
  | "lastName"
  | "firstName"
  | "middleName"
  | "position"
  | "phone"
  | "email"
  | "birthDate"
  | "hiredAt"
  | "terminatedAt"
  | "departmentId"
  | "deferralType"
  | "deferralUntil"
  | "notes"
  | "isActive"
  | "employmentType"
  | "employmentRate";

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
  inPanel = false,
}: {
  id: string;
  currentUserRole: string;
  /** Якщо рендериться у бічній панелі — приховує back-link «До списку». */
  inPanel?: boolean;
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
  // ЗП — лише SUPER_ADMIN (правило: цифри бачить тільки Адмін).
  const hasSalaryAccess = currentUserRole === "SUPER_ADMIN";
  const [salariesHidden, setSalariesHidden] = useHideSalaries();
  // Опенспейс-режим: див. employees-list — toggle спільний через localStorage.
  const canSeeSalary = hasSalaryAccess && !salariesHidden;
  // Повний профіль (вся історія, проєкти, акаунт, engagement) — лише адмін.
  // Усі інші бачать тільки ПІБ + телефон + email.
  const canSeeFullProfile = currentUserRole === "SUPER_ADMIN";

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
      // PATCH /api/admin/hr/employees НЕ повертає salaries / payrollPeriods
      // (вони лише в GET). Зливаємо нові поля з попереднім станом, щоб не
      // зіпсувати масиви — інакше undefined.length крашить рендер.
      setEmployee((prev) =>
        prev
          ? { ...prev, ...j.data, salaries: j.data.salaries ?? prev.salaries, payrollPeriods: j.data.payrollPeriods ?? prev.payrollPeriods }
          : j.data,
      );
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

  // RBAC: не-адмін → мінімальний вигляд (ПІБ + телефон + email).
  // Без зарплат, історії, проєктів, акаунту, посади, відділу тощо.
  if (!canSeeFullProfile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <EmployeeAvatar
            fullName={employee.fullName}
            lastName={employee.lastName}
            firstName={employee.firstName}
            avatarUrl={employee.user?.avatar}
            size={44}
            dimmed={!employee.isActive}
          />
          <h1 className="text-lg font-bold" style={{ color: T.textPrimary }}>
            {employee.fullName}
          </h1>
        </div>
        <div
          className="overflow-hidden rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          <div
            className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 p-4 text-[13px]"
            style={{ color: T.textPrimary }}
          >
            <span style={{ color: T.textMuted }}>Телефон</span>
            {employee.phone ? (
              <a
                href={`tel:${employee.phone}`}
                className="font-medium tabular-nums hover:underline"
                style={{ color: T.accentPrimary }}
              >
                {employee.phone}
              </a>
            ) : (
              <span style={{ color: T.textMuted }}>—</span>
            )}
            <span style={{ color: T.textMuted }}>Email</span>
            {employee.email ? (
              <a
                href={`mailto:${employee.email}`}
                className="font-medium hover:underline"
                style={{ color: T.accentPrimary }}
              >
                {employee.email}
              </a>
            ) : (
              <span style={{ color: T.textMuted }}>—</span>
            )}
          </div>
        </div>
        <p className="text-[11px]" style={{ color: T.textMuted }}>
          Розширена інформація (зарплата, проєкти, історія) доступна лише
          адміністратору.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back link — приховано у режимі бічної панелі (там є власна X). */}
      {!inPanel && (
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
      )}

      {/* Slim header */}
      <div className="flex flex-wrap items-center gap-3">
        <EmployeeAvatar
          fullName={employee.fullName}
          lastName={employee.lastName}
          firstName={employee.firstName}
          avatarUrl={employee.user?.avatar}
          size={44}
          dimmed={!employee.isActive}
        />
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
        {hasSalaryAccess && (
          <button
            type="button"
            onClick={() => setSalariesHidden(!salariesHidden)}
            title={
              salariesHidden
                ? "Зарплати приховані — натисніть, щоб показати"
                : "Сховати зарплати на цьому екрані (опенспейс-режим)"
            }
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition"
            style={{
              backgroundColor: salariesHidden ? T.accentPrimary : T.panelSoft,
              color: salariesHidden ? "#fff" : T.textSecondary,
              border: `1px solid ${salariesHidden ? T.accentPrimary : T.borderSoft}`,
            }}
          >
            {salariesHidden ? <EyeOff size={13} /> : <Eye size={13} />}
            {salariesHidden ? "ЗП приховані" : "Сховати ЗП"}
          </button>
        )}
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

      {/* Дво-колонкова сітка: Основне | Зарплата (рівні половини). */}
      <div
        className={`grid grid-cols-1 gap-4 ${canSeeSalary ? "xl:grid-cols-2" : ""}`}
      >
      <div
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
          style={{
            color: T.textSecondary,
            backgroundColor: T.panelSoft,
            borderBottom: `1px solid ${T.borderSoft}`,
          }}
        >
          <User size={12} />
          <span>Основне</span>
        </div>
        <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
          <tbody>
            <PropertyRow
              label="Прізвище"
              field="lastName"
              editing={editingField === "lastName"}
              saving={savingField === "lastName"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("lastName")}
              onCommit={(v) => patchField("lastName", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() =>
                employee.lastName ? (
                  <span className="font-medium">{employee.lastName}</span>
                ) : (
                  textOrDash(null)
                )
              }
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.lastName ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Імʼя"
              field="firstName"
              editing={editingField === "firstName"}
              saving={savingField === "firstName"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("firstName")}
              onCommit={(v) => patchField("firstName", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => textOrDash(employee.firstName)}
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.firstName ?? ""}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="По-батькові"
              field="middleName"
              editing={editingField === "middleName"}
              saving={savingField === "middleName"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("middleName")}
              onCommit={(v) => patchField("middleName", (v as string).trim() || null)}
              onCancel={() => setEditingField(null)}
              renderValue={() => textOrDash(employee.middleName)}
              renderEditor={(stop) => (
                <TextEditor
                  initial={employee.middleName ?? ""}
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
            <DepartmentRow
              employee={employee}
              canEdit={canEdit}
              editing={editingField === "departmentId"}
              saving={savingField === "departmentId"}
              onStartEdit={() => setEditingField("departmentId")}
              onCommit={(v) => patchField("departmentId", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label="Тип зайнятості"
              field="employmentType"
              editing={editingField === "employmentType"}
              saving={savingField === "employmentType"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("employmentType")}
              onCommit={(v) => patchField("employmentType", v)}
              onCancel={() => setEditingField(null)}
              renderValue={() => (
                <span style={{ color: T.textSecondary }}>
                  {EMPLOYMENT_TYPE_LABEL[employee.employmentType]}
                </span>
              )}
              renderEditor={(stop) => (
                <select
                  autoFocus
                  defaultValue={employee.employmentType}
                  onChange={(e) => stop(e.target.value as EmploymentType)}
                  onBlur={(e) => stop(e.target.value as EmploymentType)}
                  className="rounded-lg px-2 py-1 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                >
                  <option value="FULL">Повна</option>
                  <option value="PART">Неповна</option>
                  <option value="CONTRACT">Договір</option>
                </select>
              )}
            />
            <PropertyRow
              label="Ставка зайнятості"
              field="employmentRate"
              editing={editingField === "employmentRate"}
              saving={savingField === "employmentRate"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("employmentRate")}
              onCommit={(v) => {
                const num = Number(v);
                if (!Number.isFinite(num) || num < 0.1 || num > 2.0) {
                  alert("Ставка має бути в діапазоні 0.10 – 2.00");
                  setEditingField(null);
                  return;
                }
                void patchField("employmentRate", num);
              }}
              onCancel={() => setEditingField(null)}
              renderValue={() => (
                <span className="tabular-nums" style={{ color: T.textSecondary }}>
                  {Number(employee.employmentRate).toFixed(2)}
                </span>
              )}
              renderEditor={(stop) => (
                <TextEditor
                  type="number"
                  initial={Number(employee.employmentRate).toFixed(2)}
                  onCommit={(v) => stop(v)}
                  onCancel={() => stop(undefined)}
                />
              )}
            />
            <PropertyRow
              label="Тип відстрочки"
              field="deferralType"
              editing={editingField === "deferralType"}
              saving={savingField === "deferralType"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("deferralType")}
              onCommit={(v) => patchField("deferralType", v)}
              onCancel={() => setEditingField(null)}
              renderValue={() => (
                <span style={{ color: T.textSecondary }}>
                  {DEFERRAL_LABEL[employee.deferralType]}
                </span>
              )}
              renderEditor={(stop) => (
                <select
                  autoFocus
                  defaultValue={employee.deferralType}
                  onChange={(e) => stop(e.target.value as DeferralType)}
                  onBlur={(e) => stop(e.target.value as DeferralType)}
                  className="rounded-lg px-2 py-1 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                >
                  <option value="NONE">Відсутня</option>
                  <option value="RESERVATION">Бронювання</option>
                  <option value="DEFERMENT">Відстрочка</option>
                </select>
              )}
            />
            {employee.deferralType !== "NONE" && (
              <PropertyRow
                label="Відстрочка дійсна до"
                field="deferralUntil"
                editing={editingField === "deferralUntil"}
                saving={savingField === "deferralUntil"}
                canEdit={canEdit}
                onStartEdit={() => setEditingField("deferralUntil")}
                onCommit={(v) => patchField("deferralUntil", (v as string) || null)}
                onCancel={() => setEditingField(null)}
                renderValue={() => {
                  if (!employee.deferralUntil) return <span style={{ color: T.textMuted }}>—</span>;
                  const d = new Date(employee.deferralUntil);
                  const overdue = !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
                  return (
                    <span style={{ color: overdue ? T.danger : T.textSecondary }}>
                      {formatDate(employee.deferralUntil)}
                      {overdue && (
                        <AlertTriangle size={11} className="inline ml-1 -mt-0.5" />
                      )}
                    </span>
                  );
                }}
                renderEditor={(stop) => (
                  <TextEditor
                    type="date"
                    initial={toDateInput(employee.deferralUntil)}
                    onCommit={(v) => stop(v)}
                    onCancel={() => stop(undefined)}
                  />
                )}
              />
            )}
            <PropertyRow
              label="Додаткова інформація"
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

      {canSeeSalary && (
        <SalarySection
          employeeId={id}
          salaries={employee.salaries ?? []}
          payrollPeriods={employee.payrollPeriods ?? []}
          canEdit={canEdit}
          onChanged={() => void load()}
        />
      )}
      </div>

      {canSeeSalary && (employee.payrollPeriods ?? []).length > 1 && (
        <PayrollPeriodsSection periods={employee.payrollPeriods ?? []} />
      )}

      {/* "Користувач" — після всієї зарплатної інформації (включно з історією
       *  і місячними періодами). Свідомо нижче — це адмінська секція доступу,
       *  не основна інфо про співробітника. */}
      <AccountSection
        employee={employee}
        currentUserRole={currentUserRole}
        onChanged={() => void load()}
      />

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

function DepartmentRow({
  employee,
  canEdit,
  editing,
  saving,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  employee: Employee;
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCommit: (v: string | null) => void;
  onCancel: () => void;
}) {
  return (
    <PropertyRow
      label="Структурний підрозділ"
      field="departmentId"
      editing={editing}
      saving={saving}
      canEdit={canEdit}
      onStartEdit={onStartEdit}
      onCommit={(v) => onCommit((v as string | null) ?? null)}
      onCancel={onCancel}
      renderValue={() =>
        employee.department ? (
          <span style={{ color: T.textSecondary }}>{employee.department.name}</span>
        ) : (
          <span style={{ color: T.textMuted }}>—</span>
        )
      }
      renderEditor={(stop) => (
        <DepartmentSelect
          currentId={employee.departmentId}
          onCommit={(id) => stop(id)}
          onCancel={() => stop(undefined)}
        />
      )}
    />
  );
}

function DepartmentSelect({
  currentId,
  onCommit,
  onCancel,
}: {
  currentId: string | null;
  onCommit: (id: string | null) => void;
  onCancel: () => void;
}) {
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let alive = true;
    void fetch("/api/admin/hr/departments", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive) setDepartments(j.data ?? []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function createDepartment() {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    const res = await fetch("/api/admin/hr/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (res.ok) {
      onCommit(j.data.id);
    } else {
      alert(j.error ?? "Помилка");
      setCreating(false);
    }
  }

  if (creating) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void createDepartment();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder="Новий підрозділ…"
          className="rounded-lg px-2 py-1 text-sm outline-none"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderStrong}`,
            color: T.textPrimary,
          }}
        />
        <button
          onClick={createDepartment}
          className="rounded-md p-1 hover:bg-black/10"
          title="Створити"
          aria-label="Створити"
        >
          <CheckCircle2 size={14} style={{ color: T.success }} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        autoFocus
        defaultValue={currentId ?? ""}
        disabled={loading}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            setCreating(true);
            return;
          }
          onCommit(e.target.value || null);
        }}
        onBlur={(e) => {
          if (e.target.value === "__new__") return;
          onCommit(e.target.value || null);
        }}
        className="rounded-lg px-2 py-1 text-sm outline-none"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderStrong}`,
          color: T.textPrimary,
        }}
      >
        <option value="">— без підрозділу —</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
        <option value="__new__">+ Новий підрозділ…</option>
      </select>
    </div>
  );
}

function SalaryHistorySection({
  employeeId,
  salaries,
  payrollPeriods,
  canEdit,
  onChanged,
}: {
  employeeId: string;
  salaries: SalaryPeriod[];
  /** Записи з 1С (EmployeePayrollPeriod) — рендеряться поруч із ручними
   *  EmployeeSalary. Дата = імпорт (createdAt) — користувач прямо
   *  попросив бачити «дату закачки» в історії. */
  payrollPeriods: PayrollPeriod[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    baseSalary: "",
    officialPart: "",
    coefficient: "0",
    description: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const base = Number(form.baseSalary);
    if (!Number.isFinite(base) || base < 0) {
      setError("Оклад обовʼязковий і не може бути від'ємним");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees/${employeeId}/salaries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: base,
          officialPart: form.officialPart === "" ? null : Number(form.officialPart),
          coefficient: form.coefficient === "" ? 0 : Number(form.coefficient),
          description: form.description.trim() || null,
          effectiveFrom: form.effectiveFrom,
          effectiveTo: form.effectiveTo || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка");
        return;
      }
      setCreating(false);
      setForm({
        baseSalary: "",
        officialPart: "",
        coefficient: "0",
        description: "",
        effectiveFrom: new Date().toISOString().slice(0, 10),
        effectiveTo: "",
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Видалити цей запис ЗП?")) return;
    const res = await fetch(`/api/admin/hr/employees/${employeeId}/salaries/${id}`, {
      method: "DELETE",
    });
    if (res.ok) onChanged();
    else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Помилка видалення");
    }
  }

  const sorted = [...salaries].sort(
    (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
  );

  // Уніфікований список для рендеру: ручні зміни (EmployeeSalary) + імпорти з 1С
  // (EmployeePayrollPeriod). Сортуємо за датою-зайому (effectiveFrom / period)
  // у порядку «найновіше зверху». PayrollPeriod показуємо в тій самій таблиці,
  // щоб у користувача була ОДНА хронологія, а не два розрізнені блоки.
  type HistoryRow =
    | { kind: "manual"; sortMs: number; data: SalaryPeriod }
    | { kind: "payroll"; sortMs: number; data: PayrollPeriod };
  const periodToDate = (p: string): Date => {
    const [y, m] = p.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1);
  };
  const periodLabel = (p: string): string => {
    const [y, m] = p.split("-");
    const months = ["січ","лют","бер","квіт","трав","черв","лип","серп","вер","жовт","лист","груд"];
    const mi = Number(m) - 1;
    if (mi < 0 || mi > 11) return p;
    return `${months[mi]} ${y}`;
  };
  const historyRows: HistoryRow[] = [
    ...sorted.map(
      (s): HistoryRow => ({
        kind: "manual",
        sortMs: new Date(s.effectiveFrom).getTime(),
        data: s,
      }),
    ),
    ...payrollPeriods.map(
      (p): HistoryRow => ({
        kind: "payroll",
        sortMs: periodToDate(p.period).getTime(),
        data: p,
      }),
    ),
  ].sort((a, b) => b.sortMs - a.sortMs);

  const inputStyle: React.CSSProperties = {
    backgroundColor: T.panelSoft,
    border: `1px solid ${T.borderStrong}`,
    color: T.textPrimary,
  };

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ backgroundColor: T.panelSoft, borderBottom: `1px solid ${T.borderSoft}` }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: T.textSecondary }}
        >
          Зарплата (історія)
        </span>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          Оклад + Коефіцієнт = підсумок
        </span>
        <div className="flex-1" />
        {canEdit && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            <Plus size={12} /> Додати період
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
            >
              <th className="px-4 py-2.5 text-left">Період</th>
              <th className="px-3 py-2.5 text-right">Оклад</th>
              <th className="px-3 py-2.5 text-right">Офіц. частина</th>
              <th className="px-3 py-2.5 text-right">Коеф.</th>
              <th className="px-3 py-2.5 text-right">Підсумок</th>
              <th className="px-3 py-2.5 text-left">Опис</th>
              <th className="px-3 py-2.5 text-right">Дії</th>
            </tr>
          </thead>
          <tbody>
            {creating && (
              <>
                <tr style={{ borderTop: `2px solid ${T.accentPrimary}`, backgroundColor: T.accentPrimarySoft }}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1 text-[11px]">
                      <input
                        type="date"
                        value={form.effectiveFrom}
                        onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
                        className="rounded-lg px-1.5 py-0.5 outline-none"
                        style={inputStyle}
                      />
                      <span style={{ color: T.textMuted }}>—</span>
                      <input
                        type="date"
                        value={form.effectiveTo}
                        onChange={(e) => setForm((p) => ({ ...p, effectiveTo: e.target.value }))}
                        placeholder="досі"
                        className="rounded-lg px-1.5 py-0.5 outline-none"
                        style={inputStyle}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      autoFocus
                      type="number"
                      value={form.baseSalary}
                      onChange={(e) => setForm((p) => ({ ...p, baseSalary: e.target.value }))}
                      placeholder="Оклад *"
                      className="w-24 rounded-lg px-2 py-1 text-right outline-none"
                      style={inputStyle}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={form.officialPart}
                      onChange={(e) => setForm((p) => ({ ...p, officialPart: e.target.value }))}
                      placeholder="—"
                      className="w-24 rounded-lg px-2 py-1 text-right outline-none"
                      style={inputStyle}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={form.coefficient}
                      onChange={(e) => setForm((p) => ({ ...p, coefficient: e.target.value }))}
                      className="w-20 rounded-lg px-2 py-1 text-right outline-none"
                      style={inputStyle}
                    />
                  </td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    style={{ color: T.textMuted }}
                  >
                    {form.baseSalary && (
                      <span style={{ color: T.textPrimary, fontWeight: 600 }}>
                        {formatCurrency(
                          Number(form.baseSalary || 0) + Number(form.coefficient || 0),
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Опис (за що, як)"
                      className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
                      style={inputStyle}
                    />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setCreating(false);
                        setError(null);
                      }}
                      disabled={saving}
                      className="rounded-md p-1.5 hover:bg-black/10 disabled:opacity-50"
                      title="Скасувати"
                      aria-label="Скасувати"
                    >
                      <X size={14} style={{ color: T.textSecondary }} />
                    </button>
                    <button
                      onClick={submit}
                      disabled={saving}
                      className="rounded-md p-1.5 hover:bg-black/10 disabled:opacity-50"
                      title="Зберегти"
                      aria-label="Зберегти"
                    >
                      {saving ? (
                        <Loader2 size={14} className="animate-spin" style={{ color: T.accentPrimary }} />
                      ) : (
                        <CheckCircle2 size={14} style={{ color: T.success }} />
                      )}
                    </button>
                  </td>
                </tr>
                {error && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-2 text-[12px]"
                      style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                    >
                      {error}
                    </td>
                  </tr>
                )}
              </>
            )}
            {historyRows.map((row) => {
              if (row.kind === "payroll") {
                const p = row.data;
                const official = p.officialPart != null ? Number(p.officialPart) : null;
                const onCard = p.salaryToCard != null ? Number(p.salaryToCard) : null;
                return (
                  <tr key={`pp-${p.id}`} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-4 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      <span className="whitespace-nowrap font-medium" style={{ color: T.textPrimary }}>
                        {periodLabel(p.period)}
                      </span>
                      <span
                        className="ml-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{ backgroundColor: T.panelSoft, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
                        title={`Імпортовано ${formatDate(p.createdAt)}`}
                      >
                        1С · закачка {formatDate(p.createdAt)}
                      </span>
                      {p.isVacation && (
                        <span
                          className="ml-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: T.warningSoft, color: T.warning }}
                        >
                          Відпустка
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textMuted }}>
                      —
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textPrimary, fontWeight: 600 }}>
                      {official != null ? formatCurrency(official) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textMuted }}>
                      —
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textPrimary }}>
                      {onCard != null ? (
                        <>
                          {formatCurrency(onCard)}{" "}
                          <span style={{ color: T.textMuted, fontSize: 10 }}>на карту</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {p.sourceFile ? `Імпорт з 1С: ${p.sourceFile}` : "Імпорт з 1С"}
                    </td>
                    <td className="px-3 py-2.5 text-right" style={{ color: T.textMuted, fontSize: 10 }}>
                      readonly
                    </td>
                  </tr>
                );
              }
              const s = row.data;
              const total = Number(s.baseSalary) + Number(s.coefficient ?? 0);
              const isOpen = !s.effectiveTo;
              return (
                <tr key={s.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                  <td className="px-4 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                    <span className="whitespace-nowrap">
                      {formatDate(s.effectiveFrom)} — {s.effectiveTo ? formatDate(s.effectiveTo) : "досі"}
                    </span>
                    {isOpen && (
                      <span
                        className="ml-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase"
                        style={{ backgroundColor: T.successSoft, color: T.success }}
                      >
                        Активний
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textPrimary }}>
                    {formatCurrency(Number(s.baseSalary))}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right tabular-nums"
                    style={{ color: s.officialPart ? T.textSecondary : T.textMuted }}
                  >
                    {s.officialPart != null ? formatCurrency(Number(s.officialPart)) : "—"}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right tabular-nums"
                    style={{
                      color:
                        Number(s.coefficient ?? 0) === 0
                          ? T.textMuted
                          : Number(s.coefficient ?? 0) < 0
                          ? T.danger
                          : T.textPrimary,
                    }}
                  >
                    {Number(s.coefficient ?? 0) === 0 ? "—" : formatCurrency(Number(s.coefficient))}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right tabular-nums font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    {formatCurrency(total)} <span style={{ color: T.textMuted }}>{s.currency}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                    {s.description ?? <span style={{ color: T.textMuted }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {canEdit && (
                      <button
                        onClick={() => remove(s.id)}
                        className="rounded-md p-1.5 hover:bg-black/10"
                        title="Видалити"
                        aria-label="Видалити"
                      >
                        <Trash2 size={13} style={{ color: T.danger }} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!creating && historyRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: T.textMuted }}>
                  Записів про ЗП ще немає. Додайте перший період або імпортуйте з 1С.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Дві картки side-by-side за макетом:
 *   ЗАРПЛАТА — неофіційна частина (НА РУКИ = ОКЛАД + ПРЕМІЯ) з EmployeeSalary.
 *   ОФІЦІЙНА ЧАСТИНА — з останнього EmployeePayrollPeriod (1С breakdown).
 * Нижче — `SalaryHistorySection` (історія неофіційних змін).
 */
function SalarySection({
  employeeId,
  salaries,
  payrollPeriods,
  canEdit,
  onChanged,
}: {
  employeeId: string;
  salaries: SalaryPeriod[];
  payrollPeriods: PayrollPeriod[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const active = useMemo(() => {
    const now = Date.now();
    return (
      [...salaries]
        .sort(
          (a, b) =>
            new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
        )
        .find((s) => {
          if (s.effectiveTo) return new Date(s.effectiveTo).getTime() >= now;
          return new Date(s.effectiveFrom).getTime() <= now;
        }) ?? salaries[0] ?? null
    );
  }, [salaries]);

  const latestPayroll = useMemo(() => {
    if (payrollPeriods.length === 0) return null;
    return [...payrollPeriods].sort((a, b) => (a.period < b.period ? 1 : -1))[0];
  }, [payrollPeriods]);

  const base = active ? Number(active.baseSalary) : 0;
  const coef = active ? Number(active.coefficient ?? 0) : 0;
  const onHand = base + coef;
  const currency = active?.currency ?? "UAH";

  const numOrNull = (v: number | string | null | undefined): number | null => {
    if (v == null) return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
  };
  const off = latestPayroll
    ? {
        gross: numOrNull(latestPayroll.officialPart),
        pdfo: numOrNull(latestPayroll.pdfo),
        vz: numOrNull(latestPayroll.vz),
        esv: numOrNull(latestPayroll.esv),
        onCard: numOrNull(latestPayroll.salaryToCard),
        total: numOrNull(latestPayroll.totalSum),
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* === ЗАРПЛАТА (неофіційна) === */}
        <div
          className="overflow-hidden rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
            style={{
              color: T.textSecondary,
              backgroundColor: T.panelSoft,
              borderBottom: `1px solid ${T.borderSoft}`,
            }}
          >
            <Wallet size={12} />
            <span>Зарплата</span>
          </div>
          <div className="flex flex-col">
            <SalaryRow label="На руки" value={active ? `${formatCurrency(onHand)}` : "—"} emphasis />
            <SalaryRow label="Оклад" value={active ? `${formatCurrency(base)}` : "—"} />
            <SalaryRow
              label="Премія"
              value={active ? (coef === 0 ? "—" : `${formatCurrency(coef)}`) : "—"}
              tone={coef < 0 ? "danger" : undefined}
            />
            {!active && (
              <div
                className="px-4 py-2 text-[11px]"
                style={{ color: T.textMuted, borderTop: `1px solid ${T.borderSoft}` }}
              >
                Неофіційна частина ще не задана. Додайте через історію нижче.
              </div>
            )}
          </div>
        </div>

        {/* === ОФІЦІЙНА ЧАСТИНА (з 1С) === */}
        <div
          className="overflow-hidden rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
            style={{
              color: T.textSecondary,
              backgroundColor: T.panelSoft,
              borderBottom: `1px solid ${T.borderSoft}`,
            }}
          >
            <FileText size={12} />
            <span>Офіційна частина</span>
            {latestPayroll && (
              <span
                className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-normal tracking-normal"
                style={{ backgroundColor: T.panelSoft, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
              >
                {latestPayroll.period}
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <SalaryRow label="Оф. зарплата" value={off?.gross != null ? `${formatCurrency(off.gross)}` : "—"} emphasis />
            <SalaryRow label="ПДФО" value={off?.pdfo != null ? `${formatCurrency(off.pdfo)}` : "—"} muted />
            <SalaryRow label="ВЗ" value={off?.vz != null ? `${formatCurrency(off.vz)}` : "—"} muted />
            <SalaryRow label="ЄСВ" value={off?.esv != null ? `${formatCurrency(off.esv)}` : "—"} muted />
            <SalaryRow label="На карту" value={off?.onCard != null ? `${formatCurrency(off.onCard)}` : "—"} />
            <SalaryRow label="Оф. разом" value={off?.total != null ? `${formatCurrency(off.total)}` : "—"} emphasis />
            {!latestPayroll && (
              <div
                className="px-4 py-2 text-[11px]"
                style={{ color: T.textMuted, borderTop: `1px solid ${T.borderSoft}` }}
              >
                Немає даних з 1С. Імпортується через штатний розклад + ЗП-файл.
              </div>
            )}
            {latestPayroll?.isVacation && (
              <div
                className="px-4 py-2 text-[11px]"
                style={{ color: T.warning, borderTop: `1px solid ${T.borderSoft}` }}
              >
                Період позначений як ВІДПУСТКА — нарахування не виконувалися.
              </div>
            )}
          </div>
        </div>
      </div>

      <SalaryHistorySection
        employeeId={employeeId}
        salaries={salaries}
        payrollPeriods={payrollPeriods}
        canEdit={canEdit}
        onChanged={onChanged}
      />
    </div>
  );
}

function SalarySummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="px-4 py-3" style={{ borderColor: T.borderSoft }}>
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-[15px] font-semibold tabular-nums"
        style={{ color: tone === "danger" ? T.danger : T.textPrimary }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Рядок «label: value» у блоках ЗАРПЛАТА / ОФІЦІЙНА ЧАСТИНА.
 *  - emphasis: великий жирний value (для головних чисел: НА РУКИ, ОФ. ЗАРПЛАТА, ОФ. РАЗОМ)
 *  - muted: блідіший value (податки ПДФО/ВЗ/ЄСВ)
 *  - tone="danger": негативна премія
 */
function SalaryRow({
  label,
  value,
  emphasis,
  muted,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
  tone?: "danger";
}) {
  const valueColor =
    tone === "danger"
      ? T.danger
      : muted
        ? T.textSecondary
        : T.textPrimary;
  return (
    <div
      className="flex items-baseline justify-between gap-4 px-4 py-2"
      style={{ borderTop: `1px solid ${T.borderSoft}` }}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <span
        className={
          emphasis ? "text-[18px] font-bold tabular-nums" : "text-[13px] font-semibold tabular-nums"
        }
        style={{ color: valueColor }}
      >
        {value}
      </span>
    </div>
  );
}

function PayrollPeriodsSection({ periods }: { periods: PayrollPeriod[] }) {
  // Найновіший період зверху — періоди приходять відсортованими, але страхуємо.
  const sorted = useMemo(
    () => [...periods].sort((a, b) => (a.period < b.period ? 1 : -1)),
    [periods],
  );

  const fmt = (v: number | string | null) => {
    if (v == null) return "—";
    const n = typeof v === "string" ? Number(v) : v;
    if (!Number.isFinite(n) || n === 0) return "—";
    return formatCurrency(n);
  };

  const periodLabel = (p: string) => {
    const [y, m] = p.split("-");
    const months = [
      "січ",
      "лют",
      "бер",
      "квіт",
      "трав",
      "черв",
      "лип",
      "серп",
      "вер",
      "жовт",
      "лист",
      "груд",
    ];
    const mi = Number(m) - 1;
    if (mi < 0 || mi > 11) return p;
    return `${months[mi]} ${y}`;
  };

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
        style={{
          color: T.textSecondary,
          backgroundColor: T.panelSoft,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        <Wallet size={12} />
        <span>Місячні нарахування (1С)</span>
        <span className="ml-auto text-[10px] font-normal tracking-normal" style={{ color: T.textMuted }}>
          {sorted.length} {sorted.length === 1 ? "період" : "періоди"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ color: T.textPrimary }}>
          <thead>
            <tr
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
            >
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Період</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Оф. зп</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">ПДФО</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">ВЗ</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">ЄСВ</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">На карту</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Аванс</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Лік.</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Відп.</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Премії</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Метрум</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap font-bold">ЗАГ.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.id}
                className="border-t"
                style={{ borderColor: T.borderSoft }}
              >
                <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                  {periodLabel(p.period)}
                  {p.isVacation && (
                    <span
                      className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: T.panelSoft, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
                    >
                      Відпустка
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.officialPart)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textSecondary }}>{fmt(p.pdfo)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textSecondary }}>{fmt(p.vz)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textSecondary }}>{fmt(p.esv)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmt(p.salaryToCard)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.advance)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textSecondary }}>{fmt(p.sickLeave)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textSecondary }}>{fmt(p.vacationPay)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textSecondary }}>{fmt(p.bonus)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.textSecondary }}>{fmt(p.metrumExpenses)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold">{fmt(p.totalSum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.some((p) => p.sourceFile) && (
        <div
          className="px-4 py-2 text-[10px]"
          style={{ color: T.textMuted, borderTop: `1px solid ${T.borderSoft}`, backgroundColor: T.panelSoft }}
        >
          Джерело: {Array.from(new Set(sorted.map((p) => p.sourceFile).filter(Boolean))).join(", ")}
        </div>
      )}
    </div>
  );
}

function AccountSection({
  employee,
  currentUserRole,
  onChanged,
}: {
  employee: Employee;
  currentUserRole: string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "create" | "link">("idle");
  const [form, setForm] = useState({ email: "", password: "", role: "USER" });

  // Ініціалізуємо/скидаємо форму при зміні співробітника (drawer тепер
  // використовується для різних людей без закриття).
  useEffect(() => {
    if (!employee.user) {
      setForm({
        email: employee.email ?? "",
        password: "",
        role: assignableRolesFor(currentUserRole)[0] ?? "USER",
      });
      setError(null);
    }
  }, [employee.id, employee.email, employee.user, currentUserRole]);

  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<
    Array<{ id: string; name: string; email: string; role: string }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState(false);
  /// Буферизована нова роль (не зберігається до натискання «Зберегти»).
  /// null = не редагується. Уникає race onChange↔onBlur, що крашив сторінку.
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  const linked = employee.user;
  const allowedRoles = useMemo(
    () => assignableRolesFor(currentUserRole),
    [currentUserRole],
  );
  const canTouch = linked
    ? canAssignRole(currentUserRole, linked.role)
    : allowedRoles.length > 0;

  useEffect(() => {
    if (mode !== "link" || !linkSearch.trim()) {
      setLinkResults([]);
      return;
    }
    const ctl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/users?onlyWithoutEmployee=1`,
          { cache: "no-store", signal: ctl.signal },
        );
        if (!res.ok) return;
        const j = await res.json();
        const needle = linkSearch.trim().toLowerCase();
        const filtered = (j.data ?? []).filter(
          (u: { name: string; email: string }) =>
            u.name.toLowerCase().includes(needle) ||
            u.email.toLowerCase().includes(needle),
        );
        setLinkResults(filtered.slice(0, 8));
      } catch {
        // ignore
      }
    })();
    return () => ctl.abort();
  }, [mode, linkSearch]);

  function resetForm() {
    setMode("idle");
    setForm({ email: employee.email ?? "", password: "", role: allowedRoles[0] ?? "USER" });
    setError(null);
    setTempPassword(null);
    setLinkSearch("");
    setLinkResults([]);
  }

  async function handleCreate() {
    if (!form.email.trim()) {
      setError("Email обовʼязковий");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees/${employee.id}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password.trim() || undefined,
          role: form.role,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка створення");
        return;
      }
      if (j.data?.oneTimePassword) {
        setTempPassword(j.data.oneTimePassword);
      }
      setMode("idle");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleLink(userId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees/${employee.id}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingUserId: userId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка");
        return;
      }
      resetForm();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(newRole: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees/${employee.id}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка");
        return;
      }
      setEditingRole(false);
      setPendingRole(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  function startEditingRole() {
    if (!linked) return;
    setPendingRole(linked.role);
    setEditingRole(true);
  }

  function cancelEditingRole() {
    setPendingRole(null);
    setEditingRole(false);
  }

  async function handleToggleActive() {
    if (!linked) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/hr/employees/${employee.id}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !linked.isActive }),
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees/${employee.id}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPassword: true }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка");
        return;
      }
      if (j.data?.oneTimePassword) {
        setTempPassword(j.data.oneTimePassword);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlink() {
    if (!confirm("Відвʼязати акаунт від співробітника? Сам акаунт залишиться.")) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/hr/employees/${employee.id}/account`, {
        method: "DELETE",
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  // ===== Render =====
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: T.textSecondary, backgroundColor: T.panelSoft, borderBottom: `1px solid ${T.borderSoft}` }}
      >
        <ShieldCheck size={12} />
        <span>Користувач</span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {tempPassword && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
            style={{ backgroundColor: T.warningSoft, color: T.warning, border: `1px solid ${T.warning}40` }}
          >
            <KeyRound size={13} />
            <span className="font-mono select-all flex-1">{tempPassword}</span>
            <button
              onClick={() => copyToClipboard(tempPassword)}
              className="rounded-md px-2 py-1 text-[11px] font-semibold inline-flex items-center gap-1"
              style={{ backgroundColor: T.warning, color: "#fff" }}
            >
              <Copy size={11} /> Копіювати
            </button>
            <button onClick={() => setTempPassword(null)}>
              <X size={13} />
            </button>
          </div>
        )}

        {error && (
          <div
            className="rounded-xl px-3 py-2 text-[12px]"
            style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}40` }}
          >
            {error}
          </div>
        )}

        {linked ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span style={{ color: T.textMuted }}>Email:</span>
              <span className="font-medium" style={{ color: T.textPrimary }}>
                {linked.email}
              </span>
              <span className="ml-2" style={{ color: T.textMuted }}>
                Роль:
              </span>
              {editingRole && canTouch ? (
                <>
                  <select
                    autoFocus
                    value={pendingRole ?? linked.role}
                    onChange={(e) => setPendingRole(e.target.value)}
                    disabled={saving}
                    className="rounded-md px-2 py-0.5 text-[11px] outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  >
                    {allowedRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                    {/* Поточна роль, недоступна для редактора, — показати як disabled. */}
                    {!allowedRoles.includes(linked.role as never) && (
                      <option value={linked.role} disabled>
                        {ROLE_LABELS[linked.role] ?? linked.role}
                      </option>
                    )}
                  </select>
                  {pendingRole && pendingRole !== linked.role && (
                    <button
                      type="button"
                      onClick={() => void handleRoleChange(pendingRole)}
                      disabled={saving}
                      className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                      style={{ backgroundColor: T.accentPrimary }}
                    >
                      Зберегти
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={cancelEditingRole}
                    disabled={saving}
                    className="rounded-md px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50"
                    style={{ color: T.textMuted }}
                  >
                    Скасувати
                  </button>
                </>
              ) : (
                <button
                  onClick={() => canTouch && startEditingRole()}
                  disabled={!canTouch}
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: ROLE_COLORS[linked.role]?.bg ?? T.panelSoft,
                    color: ROLE_COLORS[linked.role]?.fg ?? T.textMuted,
                    cursor: canTouch ? "pointer" : "default",
                  }}
                >
                  {ROLE_LABELS[linked.role] ?? linked.role}
                </button>
              )}
              <span className="ml-auto text-[11px]" style={{ color: T.textMuted }}>
                {linked.isActive ? "Активний" : "Неактивний"}
              </span>
            </div>
            {canTouch && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => void handleResetPassword()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                  style={{
                    backgroundColor: T.panelSoft,
                    color: T.textSecondary,
                    border: `1px solid ${T.borderStrong}`,
                  }}
                >
                  <KeyRound size={12} /> Скинути пароль
                </button>
                <button
                  onClick={() => void handleToggleActive()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                  style={{
                    backgroundColor: T.panelSoft,
                    color: T.textSecondary,
                    border: `1px solid ${T.borderStrong}`,
                  }}
                >
                  {linked.isActive ? "Деактивувати" : "Активувати"}
                </button>
                <button
                  onClick={() => void handleUnlink()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                  style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                >
                  <Link2Off size={12} /> Відвʼязати
                </button>
              </div>
            )}
          </div>
        ) : mode === "create" ? (
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@example.com"
                type="email"
                className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
              <input
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Пароль (опц., згенерується)"
                type="text"
                className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              >
                {allowedRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void handleCreate()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                Створити акаунт
              </button>
              <button
                onClick={resetForm}
                disabled={saving}
                className="rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
            </div>
            <p className="text-[11px]" style={{ color: T.textMuted }}>
              ПІБ і телефон скопіюються зі співробітника. Якщо пароль порожній — буде згенерований одноразовий.
            </p>
          </div>
        ) : mode === "link" ? (
          <div className="flex flex-col gap-2">
            <input
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Пошук акаунта без співробітника — імʼя або email…"
              className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
              }}
            />
            <div className="flex flex-col gap-1">
              {linkResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => void handleLink(u.id)}
                  disabled={saving}
                  className="flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-[12px] hover:bg-black/5 disabled:opacity-50"
                  style={{ border: `1px solid ${T.borderSoft}` }}
                >
                  <span>
                    <span className="font-medium" style={{ color: T.textPrimary }}>
                      {u.name}
                    </span>
                    <span className="ml-2" style={{ color: T.textMuted }}>
                      {u.email}
                    </span>
                  </span>
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      backgroundColor: ROLE_COLORS[u.role]?.bg ?? T.panelSoft,
                      color: ROLE_COLORS[u.role]?.fg ?? T.textMuted,
                    }}
                  >
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </button>
              ))}
              {linkSearch && linkResults.length === 0 && (
                <p className="text-[11px]" style={{ color: T.textMuted }}>
                  Нічого не знайдено серед акаунтів без співробітника.
                </p>
              )}
            </div>
            <button
              onClick={resetForm}
              disabled={saving}
              className="self-start rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              style={{ color: T.textSecondary }}
            >
              Скасувати
            </button>
          </div>
        ) : (
          /* Без акаунта + адмін → одразу inline-форма (без проміжної
           *  кнопки «Створити»). Dirty-state: коли email/пароль/роль
           *  відрізняються від початкових значень — світиться «Зберегти». */
          (() => {
            const initialEmail = employee.email ?? "";
            const initialRole = allowedRoles[0] ?? "USER";
            // useEffect-init форми робиться у блоці батьківського компонента
            // через useState initializer — тут просто рендеримо.
            if (!canTouch) {
              return (
                <span className="text-[12px]" style={{ color: T.textMuted }}>
                  Без акаунта. У вас немає прав створювати акаунт цьому
                  співробітнику.
                </span>
              );
            }
            const isDirty =
              form.email.trim() !== initialEmail.trim() ||
              form.password.trim().length > 0 ||
              form.role !== initialRole;
            return (
              <div className="flex flex-col gap-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
                      Логін (email)
                    </span>
                    <input
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="email@example.com"
                      type="email"
                      className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelSoft,
                        border: `1px solid ${T.borderStrong}`,
                        color: T.textPrimary,
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
                      Пароль
                    </span>
                    <input
                      value={form.password}
                      onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Згенерується якщо порожньо"
                      type="text"
                      className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelSoft,
                        border: `1px solid ${T.borderStrong}`,
                        color: T.textPrimary,
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
                      Роль
                    </span>
                    <select
                      value={form.role}
                      onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                      className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelSoft,
                        border: `1px solid ${T.borderStrong}`,
                        color: T.textPrimary,
                      }}
                    >
                      {allowedRoles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleCreate()}
                    disabled={saving || !isDirty}
                    className="inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                    style={{ backgroundColor: T.accentPrimary }}
                    title={isDirty ? "Зберегти акаунт" : "Немає змін"}
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                    Зберегти
                  </button>
                  {isDirty && (
                    <button
                      onClick={() => setForm({ email: initialEmail, password: "", role: initialRole })}
                      disabled={saving}
                      className="rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                      style={{ color: T.textMuted }}
                    >
                      Скасувати
                    </button>
                  )}
                  <button
                    onClick={() => setMode("link")}
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                    style={{
                      backgroundColor: T.panelSoft,
                      color: T.textSecondary,
                      border: `1px solid ${T.borderStrong}`,
                    }}
                  >
                    <Link2 size={11} /> Привʼязати існуючий
                  </button>
                </div>
                <p className="text-[11px]" style={{ color: T.textMuted }}>
                  ПІБ і телефон скопіюються зі співробітника. Якщо пароль порожній — буде згенерований одноразовий.
                </p>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
