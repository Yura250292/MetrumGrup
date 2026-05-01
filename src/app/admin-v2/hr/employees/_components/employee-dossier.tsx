"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

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

      <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: T.textMuted }}>
        <span>Створено: {formatDate(employee.createdAt)}</span>
        <span>·</span>
        <span>Оновлено: {formatDate(employee.updatedAt)}</span>
      </div>
    </div>
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
