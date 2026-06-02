"use client";
/**
 * Картка профілю співробітника — табований дизайн за затвердженим макетом
 * (`employee_profile.html`). 5 вкладок: Загальне · Зарплата · Відпустки ·
 * Військовий облік · Доступ. Строга палітра у `profile/profile-tokens.ts`.
 *
 * Дані-логіка (load / draft / batch-save / RBAC) — як у попередній версії;
 * змінено лише презентацію (вертикальний стек → таби) + глобальний edit-mode.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, MoreHorizontal, Eye, EyeOff, Loader2, Check, Download, UserX, Trash2, ArrowLeft } from "lucide-react";
import { EmployeeAvatar } from "./employee-avatar";
import { useHideSalaries } from "./use-hide-salaries";
import { P } from "./profile/profile-tokens";
import {
  Badge,
  Dash,
  Divider,
  Field,
  FieldGroup,
  SectionTitle,
  SelectInput,
  TextInput,
} from "./profile/field";
import { SalaryTab } from "./profile/salary-tab";
import { VacationsTab } from "./profile/vacations-tab";
import { AccessTab } from "./profile/access-tab";
import {
  type Employee,
  type FieldKey,
  type TimeOffRecord,
  type DeferralType,
  type EmploymentType,
  DEFERRAL_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  formatDate,
  calcAge,
  formatTenure,
  toDateInput,
  shortName,
} from "./profile/types";

type TabId = "gen" | "sal" | "lv" | "mil" | "acc";

const STRING_FIELDS: FieldKey[] = [
  "lastName", "firstName", "middleName", "position", "phone", "email", "notes",
];
const DATE_FIELDS: FieldKey[] = ["birthDate", "hiredAt", "terminatedAt", "deferralUntil"];

export function EmployeeDossier({
  id,
  currentUserRole,
  inPanel = false,
  onDirtyChange,
}: {
  id: string;
  currentUserRole: string;
  inPanel?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}) {
  const router = useRouter();
  const [employeeRaw, setEmployee] = useState<Employee | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Record<FieldKey, unknown>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState<TabId>("gen");
  const [menuOpen, setMenuOpen] = useState(false);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

  const canEdit = ["SUPER_ADMIN", "MANAGER", "HR"].includes(currentUserRole);
  const canDelete = ["SUPER_ADMIN", "MANAGER"].includes(currentUserRole);
  const hasSalaryAccess = currentUserRole === "SUPER_ADMIN";
  const [salariesHidden, setSalariesHidden] = useHideSalaries();
  const canSeeSalary = hasSalaryAccess && !salariesHidden;
  const canSeeFullProfile = currentUserRole === "SUPER_ADMIN";

  const load = useCallback(async () => {
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
      setTimeOff(j.timeOff ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Підвантажуємо підрозділи для select-а при першому вході у edit-mode.
  useEffect(() => {
    if (!editMode || departments.length) return;
    void fetch("/api/admin/hr/departments", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDepartments(j.data ?? []))
      .catch(() => undefined);
  }, [editMode, departments.length]);

  const employee = useMemo<Employee | null>(
    () => (employeeRaw ? { ...employeeRaw, ...(draft as Partial<Employee>) } : null),
    [employeeRaw, draft],
  );

  const dirtyKeys = useMemo(() => Object.keys(draft) as FieldKey[], [draft]);
  const isDirty = dirtyKeys.length > 0;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Закриваємо dropdown «···» при кліку поза ним.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  function setField(field: FieldKey, value: unknown) {
    setDraft((prev) => {
      const next = { ...prev };
      const original = employeeRaw ? (employeeRaw[field] as unknown) : undefined;
      if (Object.is(original, value)) delete next[field];
      else next[field] = value;
      return next;
    });
  }

  function discard() {
    setDraft({});
    setSaveError(null);
    setEditMode(false);
  }

  async function save(): Promise<void> {
    if (!employeeRaw || dirtyKeys.length === 0) {
      setEditMode(false);
      return;
    }
    // Нормалізація: рядки trim→null, ставка валідовано, дати/підрозділ ""→null.
    const payload: Record<string, unknown> = { id };
    for (const k of dirtyKeys) {
      let v = draft[k];
      if (STRING_FIELDS.includes(k)) {
        v = typeof v === "string" ? v.trim() || null : v;
      } else if (k === "employmentRate") {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0.1 || n > 2.0) {
          setSaveError("Ставка має бути в діапазоні 0.10 – 2.00");
          return;
        }
        v = n;
      } else if (k === "departmentId" || DATE_FIELDS.includes(k)) {
        v = v === "" ? null : v;
      }
      payload[k] = v;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSaveError(j.error ?? "Помилка збереження");
        return;
      }
      const j = await res.json();
      setEmployee((prev) =>
        prev
          ? { ...prev, ...j.data, salaries: j.data.salaries ?? prev.salaries, payrollPeriods: j.data.payrollPeriods ?? prev.payrollPeriods }
          : j.data,
      );
      setDraft({});
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }

  async function terminate() {
    if (!employee) return;
    if (!confirm("Звільнити співробітника? Буде проставлено дату звільнення сьогодні.")) return;
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/admin/hr/employees`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, terminatedAt: today, isActive: false }),
    });
    if (res.ok) {
      const j = await res.json();
      setEmployee((prev) => (prev ? { ...prev, ...j.data } : j.data));
    }
  }

  async function handleDelete() {
    if (!confirm("Видалити співробітника? Дію не можна скасувати.")) return;
    const res = await fetch(`/api/admin/hr/employees?id=${id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin-v2/hr/employees");
  }

  function exportJson() {
    if (!employee) return;
    const blob = new Blob([JSON.stringify(employee, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${employee.fullName || "employee"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onDeptChange(v: string) {
    if (v === "__new__") {
      const name = window.prompt("Назва нового підрозділу");
      if (!name?.trim()) return;
      const res = await fetch("/api/admin/hr/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json();
      if (res.ok) {
        setDepartments((d) => [...d, j.data]);
        setField("departmentId", j.data.id);
      } else alert(j.error ?? "Помилка");
      return;
    }
    setField("departmentId", v || null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-[13px]" style={{ color: P.text2, fontFamily: P.font }}>
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }
  if (error || !employee) {
    return (
      <div className="rounded-[8px] px-4 py-3 text-[13px]" style={{ background: "#FDECEC", color: P.dangerFg, fontFamily: P.font }}>
        {error ?? "Не знайдено"}
      </div>
    );
  }

  // RBAC: не-адмін → мінімальний вигляд (ПІБ + телефон + email).
  if (!canSeeFullProfile) {
    return (
      <div style={{ fontFamily: P.font }} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <EmployeeAvatar fullName={employee.fullName} lastName={employee.lastName} firstName={employee.firstName} avatarUrl={employee.user?.avatar} size={44} dimmed={!employee.isActive} />
          <div className="text-[15px] font-medium" style={{ color: P.text }}>{employee.fullName}</div>
        </div>
        <div className="rounded-[8px] p-4" style={{ background: P.bg, border: `0.5px solid ${P.border}` }}>
          <FieldGroup>
            <Field label="Телефон">{employee.phone ? <a href={`tel:${employee.phone}`} style={{ color: P.blue }}>{employee.phone}</a> : <Dash />}</Field>
            <Field label="Email">{employee.email ? <a href={`mailto:${employee.email}`} style={{ color: P.blue }}>{employee.email}</a> : <Dash />}</Field>
          </FieldGroup>
        </div>
        <p className="text-[11px]" style={{ color: P.label }}>Розширена інформація доступна лише адміністратору.</p>
      </div>
    );
  }

  const tenure = formatTenure(employee.hiredAt, employee.terminatedAt);
  const terminated = !!employee.terminatedAt;

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: "gen", label: "Загальне" },
    ...(hasSalaryAccess ? [{ id: "sal" as TabId, label: "Зарплата" }] : []),
    { id: "lv", label: "Відпустки" },
    { id: "mil", label: "Військовий облік" },
    { id: "acc", label: "Доступ" },
  ];

  const editable = editMode && canEdit;

  return (
    <div style={{ fontFamily: P.font }}>
      {/* Back-link — лише на повній сторінці (не в бічній панелі). */}
      {!inPanel && (
        <Link
          href="/admin-v2/hr/employees"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] hover:underline"
          style={{ color: P.text2 }}
        >
          <ArrowLeft size={14} /> До списку співробітників
        </Link>
      )}

      {/* ===== Hero ===== */}
      <div
        className="flex items-center gap-3 rounded-t-[8px] px-5 py-3.5"
        style={{ background: P.bg, border: `0.5px solid ${P.border}`, borderBottom: "none" }}
      >
        <EmployeeAvatar fullName={employee.fullName} lastName={employee.lastName} firstName={employee.firstName} avatarUrl={employee.user?.avatar} size={44} dimmed={!employee.isActive} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium" style={{ color: P.text }}>
            {employee.fullName}
          </div>
          <div className="mt-px truncate text-[13px]" style={{ color: P.text2 }}>
            {[employee.position, employee.department?.name].filter(Boolean).join(" · ") || "—"}
            {tenure && <span> · стаж {tenure}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {terminated ? (
            <Badge bg="#FDECEC" fg={P.dangerFg}>Звільнений</Badge>
          ) : (
            <Badge bg={P.activeBg} fg={P.activeFg}>Активний</Badge>
          )}
          {hasSalaryAccess && (
            <IconBtn title={salariesHidden ? "Показати ЗП" : "Сховати ЗП"} onClick={() => setSalariesHidden(!salariesHidden)} active={salariesHidden}>
              {salariesHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </IconBtn>
          )}
          {canEdit && !editMode && (
            <IconBtn title="Редагувати" onClick={() => setEditMode(true)}>
              <Pencil size={15} />
            </IconBtn>
          )}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <IconBtn title="Дії" onClick={() => setMenuOpen((o) => !o)}>
              <MoreHorizontal size={16} />
            </IconBtn>
            {menuOpen && (
              <div
                className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[180px] rounded-[8px] py-1"
                style={{ background: P.bg, border: `0.5px solid ${P.border2}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
              >
                <MenuItem onClick={() => { setMenuOpen(false); exportJson(); }} icon={<Download size={14} />}>Експортувати (JSON)</MenuItem>
                {canEdit && !terminated && (
                  <MenuItem onClick={() => { setMenuOpen(false); void terminate(); }} icon={<UserX size={14} />} danger>Звільнити</MenuItem>
                )}
                {canDelete && (
                  <>
                    <div style={{ height: "0.5px", background: P.border, margin: "3px 0" }} />
                    <MenuItem onClick={() => { setMenuOpen(false); void handleDelete(); }} icon={<Trash2 size={14} />} danger>Видалити</MenuItem>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Edit-bar ===== */}
      {editable && (
        <div
          className="flex items-center gap-2 px-5 py-1.5 text-[13px]"
          style={{ background: P.editBarBg, color: P.editBarFg, borderLeft: `0.5px solid ${P.border}`, borderRight: `0.5px solid ${P.border}`, borderBottom: `0.5px solid ${P.editBarBorder}` }}
        >
          <Pencil size={13} />
          <span className="flex-1">Режим редагування — {isDirty ? `змін: ${dirtyKeys.length}` : "змін немає"}</span>
          {saveError && <span style={{ color: P.dangerFg }}>{saveError}</span>}
          <button onClick={discard} disabled={saving} className="rounded-[5px] border-[0.5px] px-2.5 py-1 text-[13px] disabled:opacity-50" style={{ borderColor: P.border, color: P.text2, background: "transparent" }}>
            Скасувати
          </button>
          <button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[13px] font-medium text-white disabled:opacity-60" style={{ background: P.blue }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Зберегти
          </button>
        </div>
      )}

      {/* ===== Tabs ===== */}
      <div
        className="flex overflow-x-auto px-5"
        style={{ background: P.bg, borderLeft: `0.5px solid ${P.border}`, borderRight: `0.5px solid ${P.border}`, borderBottom: `0.5px solid ${P.border}` }}
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="whitespace-nowrap px-3 py-2 text-[13px]"
              style={{
                color: on ? P.blue : P.text2,
                fontWeight: on ? 500 : 400,
                borderBottom: `2px solid ${on ? P.blue : "transparent"}`,
                marginBottom: "-0.5px",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ===== Panel ===== */}
      <div
        className="rounded-b-[8px] p-5"
        style={{ background: P.bg, border: `0.5px solid ${P.border}`, borderTop: "none" }}
      >
        {tab === "gen" && (
          <GeneralTab
            employee={employee}
            editable={editable}
            departments={departments}
            setField={setField}
            onDeptChange={onDeptChange}
          />
        )}
        {tab === "sal" && (
          hasSalaryAccess && !canSeeSalary ? (
            <div className="py-9 text-center text-[14px]" style={{ color: P.text2 }}>
              ЗП приховані. Натисніть «Показати ЗП» угорі.
            </div>
          ) : (
            <SalaryTab
              employeeId={id}
              salaries={employee.salaries ?? []}
              payrollPeriods={employee.payrollPeriods ?? []}
              canEdit={canEdit}
              onChanged={() => void load()}
            />
          )
        )}
        {tab === "lv" && <VacationsTab timeOff={timeOff} hasAccount={!!employee.userId} />}
        {tab === "mil" && (
          <MilitaryTab employee={employee} editable={editable} setField={setField} />
        )}
        {tab === "acc" && (
          <AccessTab employee={employee} currentUserRole={currentUserRole} onChanged={() => void load()} />
        )}
      </div>
    </div>
  );
}

/* ============ Hero helpers ============ */

function IconBtn({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex items-center rounded-[5px] border-[0.5px] px-1.5 py-1 transition hover:bg-black/5"
      style={{ borderColor: P.border, color: active ? P.blue : P.text2, background: active ? P.blueLt : "transparent" }}
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  onClick,
  icon,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-black/5"
      style={{ color: danger ? P.dangerFg : P.text }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ============ Загальне ============ */

function GeneralTab({
  employee,
  editable,
  departments,
  setField,
  onDeptChange,
}: {
  employee: Employee;
  editable: boolean;
  departments: Array<{ id: string; name: string }>;
  setField: (f: FieldKey, v: unknown) => void;
  onDeptChange: (v: string) => void;
}) {
  const age = calcAge(employee.birthDate);
  const txt = (f: FieldKey, type = "text") => (
    <TextInput type={type} value={String((employee[f as keyof Employee] as string) ?? "")} onChange={(v) => setField(f, v)} ariaLabel={f} />
  );
  const dateInput = (f: FieldKey) => (
    <TextInput type="date" value={toDateInput(employee[f as keyof Employee] as string | null)} onChange={(v) => setField(f, v)} ariaLabel={f} />
  );

  return (
    <div>
      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <div>
          <SectionTitle>ПІБ</SectionTitle>
          <FieldGroup>
            <Field label="Прізвище">{editable ? txt("lastName") : employee.lastName ?? <Dash />}</Field>
            <Field label="Імʼя">{editable ? txt("firstName") : employee.firstName ?? <Dash />}</Field>
            <Field label="По батькові">{editable ? txt("middleName") : employee.middleName ?? <Dash />}</Field>
            <Field label="ПІБ скорочено"><span style={{ color: P.text2 }}>{shortName(employee)}</span></Field>
          </FieldGroup>
        </div>
        <div>
          <SectionTitle>Особисті дані</SectionTitle>
          <FieldGroup>
            <Field label="Дата народження">
              {editable ? dateInput("birthDate") : (
                <span>{formatDate(employee.birthDate)}{age !== null && employee.birthDate && <span className="ml-2 text-[11px]" style={{ color: P.label }}>({age} р)</span>}</span>
              )}
            </Field>
            <Field label="Стать"><Dash /></Field>
            <Field label="Табельний номер">{employee.employeeNumber ? <span>{employee.employeeNumber}</span> : <Dash />}</Field>
          </FieldGroup>
        </div>
      </div>

      <Divider />

      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <div>
          <SectionTitle>Посада та зайнятість</SectionTitle>
          <FieldGroup>
            <Field label="Посада">{editable ? txt("position") : employee.position ?? <Dash />}</Field>
            <Field label="Підрозділ">
              {editable ? (
                <select
                  value={employee.departmentId ?? ""}
                  onChange={(e) => onDeptChange(e.target.value)}
                  className="rounded-[5px] border-[0.5px] bg-white px-[7px] py-[3px] text-[13px] outline-none focus:border-[#185FA5] focus:shadow-[0_0_0_2px_#E6F1FB]"
                  style={{ borderColor: P.border2, color: P.text, width: 200 }}
                >
                  <option value="">— без підрозділу —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                  <option value="__new__">+ Новий підрозділ…</option>
                </select>
              ) : employee.department ? (
                <span style={{ color: P.blue }}>{employee.department.name}</span>
              ) : (
                <Dash />
              )}
            </Field>
            <Field label="Тип зайнятості">
              {editable ? (
                <SelectInput<EmploymentType>
                  value={employee.employmentType}
                  onChange={(v) => setField("employmentType", v)}
                  options={[{ value: "FULL", label: "Повна" }, { value: "PART", label: "Неповна" }, { value: "CONTRACT", label: "Договір" }]}
                />
              ) : (
                EMPLOYMENT_TYPE_LABEL[employee.employmentType]
              )}
            </Field>
            <Field label="Ставка зайнятості">
              {editable ? (
                <TextInput type="number" value={Number(employee.employmentRate).toFixed(2)} onChange={(v) => setField("employmentRate", v)} width={90} ariaLabel="employmentRate" />
              ) : (
                <span className="tabular-nums">{Number(employee.employmentRate).toFixed(2)}</span>
              )}
            </Field>
          </FieldGroup>
        </div>
        <div>
          <SectionTitle style={{ color: "transparent" }}>—</SectionTitle>
          <FieldGroup>
            <Field label="Прийнятий">{editable ? dateInput("hiredAt") : formatDate(employee.hiredAt)}</Field>
            <Field label="Звільнений">{editable ? dateInput("terminatedAt") : (employee.terminatedAt ? formatDate(employee.terminatedAt) : <Dash />)}</Field>
            <Field label="Активний">
              {editable ? (
                <SelectInput<string>
                  value={employee.isActive ? "1" : "0"}
                  onChange={(v) => setField("isActive", v === "1")}
                  options={[{ value: "1", label: "Так" }, { value: "0", label: "Ні" }]}
                  width={90}
                />
              ) : (
                <span style={{ color: employee.isActive ? P.activeFg : P.dangerFg }}>{employee.isActive ? "Так" : "Ні"}</span>
              )}
            </Field>
          </FieldGroup>
        </div>
      </div>

      <Divider />

      {/* Контакти — наявні backed-поля phone + email. */}
      <SectionTitle>Контакти</SectionTitle>
      <FieldGroup>
        <Field label="Телефон">
          {editable ? txt("phone") : employee.phone ? <a href={`tel:${employee.phone}`} style={{ color: P.text }}>{employee.phone}</a> : <Dash />}
        </Field>
        <Field label="Ел. пошта">
          {editable ? txt("email", "email") : employee.email ? <a href={`mailto:${employee.email}`} style={{ color: P.blue }}>{employee.email}</a> : <Dash />}
        </Field>
      </FieldGroup>

      <Divider />

      <SectionTitle>Нотатки</SectionTitle>
      {editable ? (
        <textarea
          rows={3}
          value={employee.notes ?? ""}
          onChange={(e) => setField("notes", e.target.value)}
          className="w-full resize-none rounded-[8px] border-[0.5px] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#185FA5] focus:shadow-[0_0_0_2px_#E6F1FB]"
          style={{ borderColor: P.border2, color: P.text, background: P.bg2 }}
        />
      ) : (
        <div className="rounded-[8px] px-3.5 py-2.5 text-[13px] leading-relaxed" style={{ background: P.bg2, color: P.text2 }}>
          {employee.notes || "—"}
        </div>
      )}
    </div>
  );
}

/* ============ Військовий облік ============ */

function MilitaryTab({
  employee,
  editable,
  setField,
}: {
  employee: Employee;
  editable: boolean;
  setField: (f: FieldKey, v: unknown) => void;
}) {
  const overdue =
    employee.deferralUntil &&
    !Number.isNaN(new Date(employee.deferralUntil).getTime()) &&
    new Date(employee.deferralUntil).getTime() < Date.now();
  return (
    <div>
      <SectionTitle>Військово-облікові дані</SectionTitle>
      <FieldGroup>
        <Field label="Тип відстрочки">
          {editable ? (
            <SelectInput<DeferralType>
              value={employee.deferralType}
              onChange={(v) => setField("deferralType", v)}
              options={[{ value: "NONE", label: "Відсутня" }, { value: "RESERVATION", label: "Бронювання" }, { value: "DEFERMENT", label: "Відстрочка" }]}
            />
          ) : (
            DEFERRAL_LABEL[employee.deferralType]
          )}
        </Field>
        {employee.deferralType !== "NONE" && (
          <Field label="Дійсна до">
            {editable ? (
              <TextInput type="date" value={toDateInput(employee.deferralUntil)} onChange={(v) => setField("deferralUntil", v)} ariaLabel="deferralUntil" />
            ) : employee.deferralUntil ? (
              <span style={{ color: overdue ? P.dangerFg : P.text }}>{formatDate(employee.deferralUntil)}{overdue && " (прострочено)"}</span>
            ) : (
              <Dash />
            )}
          </Field>
        )}
        <Field label="Дублер"><Dash /></Field>
        <Field label="Дублер для"><Dash /></Field>
      </FieldGroup>
    </div>
  );
}
