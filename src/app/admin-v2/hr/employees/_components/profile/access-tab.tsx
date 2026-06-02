"use client";
/** Вкладка «Доступ» — керування акаунтом/ролями (логіка з AccountSection). */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Copy, X, Link2, UserPlus } from "lucide-react";
import { P, PROFILE_ROLE_COLORS } from "./profile-tokens";
import { Badge, Field, FieldGroup, LinkAction } from "./field";
import { ROLE_LABELS, assignableRolesFor, canAssignRole } from "@/app/admin-v2/_lib/role-display";
import type { Employee } from "./types";

const inputCls =
  "rounded-[5px] border-[0.5px] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#185FA5] focus:shadow-[0_0_0_2px_#E6F1FB]";

export function AccessTab({
  employee,
  currentUserRole,
  onChanged,
}: {
  employee: Employee;
  currentUserRole: string;
  onChanged: () => void;
}) {
  const linked = employee.user;
  const allowedRoles = useMemo(() => assignableRolesFor(currentUserRole), [currentUserRole]);
  const canTouch = linked ? canAssignRole(currentUserRole, linked.role) : allowedRoles.length > 0;

  const [mode, setMode] = useState<"idle" | "link">("idle");
  const [form, setForm] = useState({ email: "", password: "", role: "USER" });
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState(false);
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  const inputStyle = { borderColor: P.border2, color: P.text } as React.CSSProperties;

  useEffect(() => {
    if (!linked) {
      setForm({ email: employee.email ?? "", password: "", role: allowedRoles[0] ?? "USER" });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, employee.email, linked]);

  useEffect(() => {
    if (mode !== "link" || !linkSearch.trim()) {
      setLinkResults([]);
      return;
    }
    const ctl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users?onlyWithoutEmployee=1`, { cache: "no-store", signal: ctl.signal });
        if (!res.ok) return;
        const j = await res.json();
        const needle = linkSearch.trim().toLowerCase();
        const filtered = (j.data ?? []).filter(
          (u: { name: string; email: string }) =>
            u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle),
        );
        setLinkResults(filtered.slice(0, 8));
      } catch {
        /* ignore */
      }
    })();
    return () => ctl.abort();
  }, [mode, linkSearch]);

  function reset() {
    setMode("idle");
    setForm({ email: employee.email ?? "", password: "", role: allowedRoles[0] ?? "USER" });
    setError(null);
    setLinkSearch("");
    setLinkResults([]);
  }

  async function create() {
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
        body: JSON.stringify({ email: form.email.trim(), password: form.password.trim() || undefined, role: form.role }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка створення");
        return;
      }
      if (j.data?.oneTimePassword) setTempPassword(j.data.oneTimePassword);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function link(userId: string) {
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
      reset();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function patch(body: Record<string, unknown>): Promise<{ oneTimePassword?: string } | null> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees/${employee.id}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка");
        return null;
      }
      return j.data ?? {};
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(role: string) {
    const d = await patch({ role });
    if (d) {
      setEditingRole(false);
      setPendingRole(null);
      onChanged();
    }
  }
  async function toggleActive() {
    if (!linked) return;
    if (await patch({ isActive: !linked.isActive })) onChanged();
  }
  async function resetPassword() {
    const d = await patch({ resetPassword: true });
    if (d?.oneTimePassword) setTempPassword(d.oneTimePassword);
  }
  async function unlink() {
    if (!confirm("Відвʼязати акаунт від співробітника? Сам акаунт залишиться.")) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/hr/employees/${employee.id}/account`, { method: "DELETE" });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  const roleTone = (role: string) => PROFILE_ROLE_COLORS[role] ?? { bg: P.bg2, fg: P.text2 };

  return (
    <div>
      {tempPassword && (
        <div
          className="mb-3 flex items-center gap-2 rounded-[8px] px-3 py-2 text-[12px]"
          style={{ background: P.editBarBg, color: P.editBarFg, border: `0.5px solid ${P.editBarBorder}` }}
        >
          <span className="flex-1 select-all font-mono">{tempPassword}</span>
          <button onClick={() => navigator.clipboard?.writeText(tempPassword)} className="inline-flex items-center gap-1 rounded px-2 py-1" style={{ background: P.blue, color: "#fff" }}>
            <Copy size={11} /> Копіювати
          </button>
          <button onClick={() => setTempPassword(null)} aria-label="Закрити"><X size={13} /></button>
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "#FDECEC", color: P.dangerFg }}>
          {error}
        </div>
      )}

      {linked ? (
        <FieldGroup>
          <Field label="Логін">{linked.email}</Field>
          <Field label="Пароль">
            <LinkAction onClick={resetPassword} disabled={!canTouch || saving}>
              Скинути / оновити пароль
            </LinkAction>
          </Field>
          <Field label="Ролі доступу">
            {editingRole && canTouch ? (
              <span className="inline-flex items-center gap-2">
                <select
                  autoFocus
                  value={pendingRole ?? linked.role}
                  onChange={(e) => setPendingRole(e.target.value)}
                  disabled={saving}
                  className="rounded-[5px] border-[0.5px] bg-white px-2 py-0.5 text-[12px] outline-none"
                  style={inputStyle}
                >
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                  {!allowedRoles.includes(linked.role as never) && (
                    <option value={linked.role} disabled>{ROLE_LABELS[linked.role] ?? linked.role}</option>
                  )}
                </select>
                {pendingRole && pendingRole !== linked.role && (
                  <LinkAction onClick={() => changeRole(pendingRole)} disabled={saving}>Зберегти</LinkAction>
                )}
                <button onClick={() => { setEditingRole(false); setPendingRole(null); }} className="text-[12px]" style={{ color: P.label }}>Скасувати</button>
              </span>
            ) : (
              <button
                onClick={() => { if (canTouch) { setPendingRole(linked.role); setEditingRole(true); } }}
                disabled={!canTouch}
                style={{ cursor: canTouch ? "pointer" : "default" }}
                title={canTouch ? "Змінити роль" : undefined}
              >
                <Badge bg={roleTone(linked.role).bg} fg={roleTone(linked.role).fg}>
                  {ROLE_LABELS[linked.role] ?? linked.role}
                </Badge>
              </button>
            )}
          </Field>
          <Field label="Статус доступу">
            <span className="inline-flex items-center gap-3">
              {linked.isActive ? (
                <Badge bg={P.activeBg} fg={P.activeFg}>Активний</Badge>
              ) : (
                <Badge bg="#FDECEC" fg={P.dangerFg}>Неактивний</Badge>
              )}
              {canTouch && (
                <>
                  <LinkAction onClick={toggleActive} disabled={saving}>
                    {linked.isActive ? "Деактивувати" : "Активувати"}
                  </LinkAction>
                  <button onClick={unlink} disabled={saving} className="text-[13px] hover:underline" style={{ color: P.dangerFg }}>
                    Відвʼязати
                  </button>
                </>
              )}
            </span>
          </Field>
          <Field label="Останній вхід">
            <span style={{ color: P.text2 }}>—</span>
          </Field>
        </FieldGroup>
      ) : !canTouch ? (
        <p className="text-[13px]" style={{ color: P.text2 }}>
          Без акаунта. У вас немає прав створювати акаунт цьому співробітнику.
        </p>
      ) : mode === "link" ? (
        <div className="flex flex-col gap-2">
          <input
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            placeholder="Пошук акаунта без співробітника — імʼя або email…"
            className={inputCls}
            style={inputStyle}
          />
          <div className="flex flex-col gap-1">
            {linkResults.map((u) => (
              <button
                key={u.id}
                onClick={() => link(u.id)}
                disabled={saving}
                className="flex items-center justify-between rounded-[8px] px-3 py-1.5 text-left text-[13px] hover:bg-black/5"
                style={{ border: `0.5px solid ${P.border}` }}
              >
                <span>
                  <span style={{ color: P.text }}>{u.name}</span>
                  <span className="ml-2" style={{ color: P.label }}>{u.email}</span>
                </span>
                <Badge bg={roleTone(u.role).bg} fg={roleTone(u.role).fg}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
              </button>
            ))}
            {linkSearch && linkResults.length === 0 && (
              <p className="text-[12px]" style={{ color: P.label }}>Нічого не знайдено серед акаунтів без співробітника.</p>
            )}
          </div>
          <button onClick={reset} className="self-start text-[13px]" style={{ color: P.text2 }}>Скасувати</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: P.label }}>Логін (email)</span>
              <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="email@example.com" type="email" className={inputCls} style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: P.label }}>Пароль</span>
              <input value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="Згенерується якщо порожньо" type="text" className={inputCls} style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: P.label }}>Роль</span>
              <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} className={inputCls} style={inputStyle}>
                {allowedRoles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={create} disabled={saving} className="inline-flex items-center gap-1.5 rounded-[5px] px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50" style={{ background: P.blue }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Створити акаунт
            </button>
            <button onClick={() => setMode("link")} className="inline-flex items-center gap-1 text-[13px]" style={{ color: P.blue }}>
              <Link2 size={13} /> Привʼязати існуючий
            </button>
          </div>
          <p className="text-[11px]" style={{ color: P.label }}>
            ПІБ і телефон скопіюються зі співробітника. Якщо пароль порожній — буде згенерований одноразовий.
          </p>
        </div>
      )}
    </div>
  );
}
