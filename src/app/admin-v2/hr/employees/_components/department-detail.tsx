"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { EmployeeAvatar } from "./employee-avatar";

type DeptEmployee = {
  id: string;
  fullName: string;
  position: string | null;
  isActive: boolean;
};

type DeptTeam = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  lead: { id: string; name: string } | null;
  _count: { members: number };
};

type DepartmentFull = {
  id: string;
  name: string;
  description: string | null;
  head: { id: string; name: string } | null;
  employees: DeptEmployee[];
  teams: DeptTeam[];
};

/**
 * Кандидат для керівника / бригадира / учасника бригади.
 * Список будується зі співробітників, а не з User-ів. Якщо у співробітника
 * ще не привʼязаний акаунт (`userId === null`) — він показується у списку
 * з позначкою "без акаунта", але вибрати його не можна (схема зберігає
 * `headUserId`/`leadUserId`, тобто посилання на User). Це тимчасово, поки
 * команда поступово привʼязує акаунти до співробітників.
 */
type UserOption = { userId: string | null; name: string };

type TeamMemberRow = {
  user: { id: string; name: string; avatar: string | null };
};

const BRIGADE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function DepartmentDetail({
  departmentId,
  canEdit,
  onClose,
  onChanged,
}: {
  departmentId: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [dept, setDept] = useState<DepartmentFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Кандидати для керівника / бригадирів / учасників — співробітники з акаунтом.
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  // Усі співробітники (для додавання у підрозділ).
  const [allEmployees, setAllEmployees] = useState<
    { id: string; fullName: string; departmentId: string | null }[]
  >([]);

  // Поля шапки.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [headUserId, setHeadUserId] = useState("");
  const [savingHead, setSavingHead] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dRes, eRes] = await Promise.all([
        fetch(`/api/admin/hr/departments/${departmentId}`, { cache: "no-store" }),
        fetch("/api/admin/hr/employees", { cache: "no-store" }),
      ]);
      const dJson = await dRes.json().catch(() => ({}));
      if (!dRes.ok) {
        setError(dJson.error ?? `HTTP ${dRes.status}`);
        return;
      }
      const d: DepartmentFull = dJson.data;
      setDept(d);
      setName(d.name);
      setDescription(d.description ?? "");
      setHeadUserId(d.head?.id ?? "");

      if (eRes.ok) {
        const eJson = await eRes.json().catch(() => ({}));
        const emps = (eJson.data ?? []) as {
          id: string;
          fullName: string;
          userId: string | null;
          isActive: boolean;
          departmentId: string | null;
        }[];
        setAllEmployees(
          emps.map((e) => ({
            id: e.id,
            fullName: e.fullName,
            departmentId: e.departmentId,
          })),
        );
        // Усі активні співробітники потрапляють у dropdown; ті, в кого ще немає
        // акаунта (userId === null), показуються disabled — щоб директор бачив
        // повну картину людей, навіть якщо вибрати ще не може.
        setUserOptions(
          emps
            .filter((e) => e.isActive)
            .map((e) => ({ userId: e.userId, name: e.fullName })),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty =
    dept !== null &&
    (name.trim() !== dept.name ||
      description.trim() !== (dept.description ?? "") ||
      headUserId !== (dept.head?.id ?? ""));

  async function saveHeader() {
    if (!dept || !name.trim()) return;
    setSavingHead(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/departments/${departmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          headUserId: headUserId || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Не вдалось зберегти");
        return;
      }
      await load();
      onChanged();
    } finally {
      setSavingHead(false);
    }
  }

  async function deleteDepartment() {
    if (!dept) return;
    if (!confirm(`Видалити підрозділ «${dept.name}»?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/hr/departments/${departmentId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Не вдалось видалити");
      return;
    }
    onChanged();
    onClose();
  }

  async function assignEmployee(employeeId: string) {
    const res = await fetch(`/api/admin/hr/employees`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: employeeId, departmentId }),
    });
    if (res.ok) {
      await load();
      onChanged();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Не вдалось додати співробітника");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: "rgba(15,23,42,0.55)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col"
        style={{ backgroundColor: T.panel, boxShadow: "-24px 0 48px rgba(15,23,42,0.25)" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-5 py-3"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <Building2 size={18} style={{ color: T.accentPrimary }} />
          <h3 className="flex-1 text-base font-bold" style={{ color: T.textPrimary }}>
            {dept?.name ?? "Підрозділ"}
          </h3>
          {canEdit && dept && (
            <button
              onClick={() => void deleteDepartment()}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
              style={{ color: T.danger }}
            >
              <Trash2 size={13} /> Видалити
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-black/5"
            aria-label="Закрити"
          >
            <X size={16} style={{ color: T.textMuted }} />
          </button>
        </div>

        {loading && (
          <div
            className="flex items-center justify-center gap-2 py-16 text-sm"
            style={{ color: T.textMuted }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        )}

        {error && (
          <div
            className="mx-5 mt-3 rounded-xl px-3 py-2 text-[12px]"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}40`,
            }}
          >
            ⚠ {error}
          </div>
        )}

        {!loading && dept && (
          <div className="flex-1 overflow-y-auto p-5">
            {/* Основні дані */}
            <div
              className="flex flex-col gap-3 rounded-2xl p-4"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
            >
              <Field label="Назва підрозділу">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-70"
                  style={inputStyle()}
                />
              </Field>
              <Field label="Керівник підрозділу">
                <select
                  value={headUserId}
                  onChange={(e) => setHeadUserId(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-70"
                  style={inputStyle()}
                >
                  <option value="">— не призначено —</option>
                  {renderEmployeeOptions(userOptions)}
                </select>
              </Field>
              <Field label="Нотатки">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canEdit}
                  rows={2}
                  className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-70"
                  style={inputStyle()}
                />
              </Field>
              {canEdit && (
                <button
                  onClick={() => void saveHeader()}
                  disabled={!dirty || savingHead || !name.trim()}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: T.accentPrimary }}
                >
                  {savingHead ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Save size={13} />
                  )}
                  Зберегти зміни
                </button>
              )}
            </div>

            {/* Співробітники */}
            <SectionTitle
              icon={<UsersRound size={14} style={{ color: T.textSecondary }} />}
              title="Співробітники"
              count={dept.employees.length}
            />
            <div
              className="overflow-hidden rounded-2xl"
              style={{ border: `1px solid ${T.borderSoft}` }}
            >
              {dept.employees.length === 0 && (
                <div
                  className="px-4 py-6 text-center text-[12px]"
                  style={{ color: T.textMuted }}
                >
                  У підрозділі немає співробітників.
                </div>
              )}
              {dept.employees.map((e, i) => (
                <Link
                  key={e.id}
                  href={`/admin-v2/hr/employees/${e.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 transition hover:bg-black/[0.02]"
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                    opacity: e.isActive ? 1 : 0.55,
                  }}
                >
                  <EmployeeAvatar fullName={e.fullName} size={26} />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[13px] font-medium"
                      style={{ color: T.textPrimary }}
                    >
                      {e.fullName}
                    </div>
                    <div className="truncate text-[11px]" style={{ color: T.textMuted }}>
                      {e.position || "—"}
                    </div>
                  </div>
                  <ChevronRight size={15} style={{ color: T.textMuted }} />
                </Link>
              ))}
            </div>
            {canEdit && (
              <AddEmployeeRow
                candidates={allEmployees.filter((e) => e.departmentId !== departmentId)}
                onPick={(id) => void assignEmployee(id)}
              />
            )}

            {/* Бригади */}
            <SectionTitle
              icon={<UsersRound size={14} style={{ color: T.textSecondary }} />}
              title="Бригади"
              count={dept.teams.length}
            />
            <div className="flex flex-col gap-2">
              {dept.teams.length === 0 && (
                <div
                  className="rounded-2xl px-4 py-6 text-center text-[12px]"
                  style={{ border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
                >
                  У підрозділі немає бригад.
                </div>
              )}
              {dept.teams.map((team) => (
                <BrigadeCard
                  key={team.id}
                  team={team}
                  canEdit={canEdit}
                  userOptions={userOptions}
                  onChanged={() => {
                    void load();
                    onChanged();
                  }}
                />
              ))}
            </div>
            {canEdit && (
              <CreateBrigadeRow
                departmentId={departmentId}
                onCreated={() => {
                  void load();
                  onChanged();
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddEmployeeRow({
  candidates,
  onPick,
}: {
  candidates: { id: string; fullName: string }[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold"
        style={{ color: T.accentPrimary }}
      >
        <Plus size={13} /> Додати співробітника
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <select
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
        style={inputStyle()}
      >
        <option value="">— оберіть співробітника —</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.fullName}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (value) onPick(value);
          setValue("");
          setOpen(false);
        }}
        disabled={!value}
        className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
        style={{ backgroundColor: T.accentPrimary }}
      >
        Додати
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setValue("");
        }}
        className="rounded-lg p-2 hover:bg-black/5"
        aria-label="Скасувати"
      >
        <X size={15} style={{ color: T.textMuted }} />
      </button>
    </div>
  );
}

function CreateBrigadeRow({
  departmentId,
  onCreated,
}: {
  departmentId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          departmentId,
        }),
      });
      if (res.ok) {
        setName("");
        setDescription("");
        setOpen(false);
        onCreated();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold"
        style={{ color: T.accentPrimary }}
      >
        <Plus size={13} /> Додати бригаду
      </button>
    );
  }
  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded-2xl p-3"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Назва бригади (напр. «Бригада 2»)"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={inputStyle()}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Тип робіт (напр. «Монолітні роботи»)"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={inputStyle()}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => void create()}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Створити
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setName("");
            setDescription("");
          }}
          className="rounded-lg px-3 py-2 text-[12px] font-semibold"
          style={{ color: T.textSecondary }}
        >
          Скасувати
        </button>
      </div>
    </div>
  );
}

function BrigadeCard({
  team,
  canEdit,
  userOptions,
  onChanged,
}: {
  team: DeptTeam;
  canEdit: boolean;
  userOptions: UserOption[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [color, setColor] = useState(team.color);
  const [leadUserId, setLeadUserId] = useState(team.lead?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [addUserId, setAddUserId] = useState("");

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setMembers(j.data?.members ?? []);
    } finally {
      setLoadingMembers(false);
    }
  }, [team.id]);

  useEffect(() => {
    if (expanded) void loadMembers();
  }, [expanded, loadMembers]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.user.id)), [members]);

  async function saveBrigade() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || team.name,
          description: description.trim() || null,
          color,
          leadUserId: leadUserId || null,
        }),
      });
      if (res.ok) onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function deleteBrigade() {
    if (!confirm(`Видалити бригаду «${team.name}»?`)) return;
    const res = await fetch(`/api/admin/teams/${team.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  }

  async function addMember() {
    if (!addUserId) return;
    const res = await fetch(`/api/admin/teams/${team.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: addUserId }),
    });
    if (res.ok) {
      setAddUserId("");
      await loadMembers();
      onChanged();
    }
  }

  async function removeMember(userId: string) {
    const res = await fetch(
      `/api/admin/teams/${team.id}/members?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      await loadMembers();
      onChanged();
    }
  }

  return (
    <div
      className="rounded-2xl"
      style={{ border: `1px solid ${T.borderSoft}`, backgroundColor: T.panelSoft }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span
          className="h-7 w-7 shrink-0 rounded-lg"
          style={{ backgroundColor: team.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold" style={{ color: T.textPrimary }}>
            {team.name}
          </div>
          <div className="truncate text-[11px]" style={{ color: T.textMuted }}>
            {[team.description, `${team._count.members} учасн.`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {expanded ? (
          <ChevronDown size={15} style={{ color: T.textMuted }} />
        ) : (
          <ChevronRight size={15} style={{ color: T.textMuted }} />
        )}
      </button>

      {expanded && (
        <div
          className="flex flex-col gap-3 px-3 pb-3"
          style={{ borderTop: `1px solid ${T.borderSoft}` }}
        >
          {canEdit && (
            <div className="flex flex-col gap-2 pt-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Назва бригади"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Тип робіт"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
              />
              <select
                value={leadUserId}
                onChange={(e) => setLeadUserId(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
              >
                <option value="">— бригадир не призначений —</option>
                {renderEmployeeOptions(userOptions)}
              </select>
              <div className="flex items-center gap-1.5">
                {BRIGADE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="h-6 w-6 rounded-md"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? `2px solid ${T.textPrimary}` : "none",
                      outlineOffset: 1,
                    }}
                    aria-label={`Колір ${c}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void saveBrigade()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: T.accentPrimary }}
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Зберегти
                </button>
                <button
                  onClick={() => void deleteBrigade()}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                  style={{ color: T.danger }}
                >
                  <Trash2 size={12} /> Видалити бригаду
                </button>
              </div>
            </div>
          )}

          {/* Учасники */}
          <div className="flex flex-col gap-1.5 pt-1">
            <span
              className="text-[10px] font-bold tracking-wider"
              style={{ color: T.textMuted }}
            >
              УЧАСНИКИ
            </span>
            {loadingMembers && (
              <span className="text-[12px]" style={{ color: T.textMuted }}>
                Завантажуємо…
              </span>
            )}
            {!loadingMembers && members.length === 0 && (
              <span className="text-[12px]" style={{ color: T.textMuted }}>
                Учасників ще немає.
              </span>
            )}
            {members.map((m) => (
              <div
                key={m.user.id}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
              >
                <EmployeeAvatar
                  fullName={m.user.name}
                  avatarUrl={m.user.avatar}
                  size={22}
                />
                <span className="flex-1 text-[12px]" style={{ color: T.textPrimary }}>
                  {m.user.name}
                </span>
                {canEdit && (
                  <button
                    onClick={() => void removeMember(m.user.id)}
                    className="rounded p-1 hover:bg-black/5"
                    aria-label="Прибрати"
                  >
                    <X size={13} style={{ color: T.textMuted }} />
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <div className="flex items-center gap-2 pt-1">
                <select
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  className="flex-1 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                  style={inputStyle()}
                >
                  <option value="">— додати учасника —</option>
                  {renderEmployeeOptions(
                    userOptions.filter(
                      (u) => !u.userId || !memberIds.has(u.userId),
                    ),
                  )}
                </select>
                <button
                  onClick={() => void addMember()}
                  disabled={!addUserId}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: T.accentPrimary }}
                >
                  <UserPlus size={12} /> Додати
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-2 mt-5 flex items-center gap-1.5">
      {icon}
      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: T.textSecondary }}>
        {title}
      </span>
      <span
        className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
        style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
      >
        {count}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    backgroundColor: T.panel,
    border: `1px solid ${T.borderStrong}`,
    color: T.textPrimary,
  };
}

/**
 * Спільний рендер опцій dropdown-а для керівника/бригадира/учасника.
 * Співробітники без привʼязаного акаунта показуються disabled з підписом
 * «(без акаунта)» — щоб директор бачив повний штат, але не міг призначити
 * нікого, для кого ще немає User-а у схемі.
 */
function renderEmployeeOptions(options: UserOption[]): React.ReactNode {
  return options.map((u, idx) => {
    if (!u.userId) {
      return (
        <option key={`no-acct-${idx}-${u.name}`} value="" disabled>
          {u.name} — без акаунта
        </option>
      );
    }
    return (
      <option key={u.userId} value={u.userId}>
        {u.name}
      </option>
    );
  });
}
