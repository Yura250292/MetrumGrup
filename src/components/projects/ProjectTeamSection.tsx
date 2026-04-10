"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, Loader2, Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ProjectRole } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  useProjectMembers,
  useAddProjectMember,
  useChangeMemberRole,
  useRemoveMember,
  type ProjectMemberDTO,
} from "@/hooks/useProjectMembers";

const ROLE_LABELS: Record<ProjectRole, string> = {
  PROJECT_ADMIN: "Адмін проєкту",
  PROJECT_MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FOREMAN: "Виконроб",
  FINANCE: "Фінанси",
  PROCUREMENT: "Закупівлі",
  VIEWER: "Спостерігач",
};

const ROLE_OPTIONS: ProjectRole[] = [
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "ENGINEER",
  "FOREMAN",
  "FINANCE",
  "PROCUREMENT",
  "VIEWER",
];

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
};

function useStaffUsers() {
  return useQuery({
    queryKey: ["chat", "staffUsers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/chat/users");
      if (!res.ok) throw new Error("Не вдалося завантажити список співробітників");
      const data = await res.json();
      return data.users as StaffUser[];
    },
  });
}

export function ProjectTeamSection({ projectId }: { projectId: string }) {
  const membersQ = useProjectMembers(projectId);
  const addMutation = useAddProjectMember(projectId);
  const changeRole = useChangeMemberRole(projectId);
  const removeMember = useRemoveMember(projectId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const active = (membersQ.data ?? []).filter((m) => m.isActive);
  const inactive = (membersQ.data ?? []).filter((m) => !m.isActive);

  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex items-center justify-between rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            Команда проєкту
          </span>
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            {active.length} активних учасників
          </span>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: T.accentPrimary, color: T.background }}
        >
          <UserPlus size={14} /> Додати
        </button>
      </div>

      {membersQ.isLoading && (
        <div
          className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm"
          style={{ backgroundColor: T.panel, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
        >
          <Loader2 size={16} className="animate-spin" /> Завантажуємо…
        </div>
      )}

      {membersQ.error && (
        <div
          className="rounded-2xl px-4 py-3 text-xs"
          style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
        >
          {(membersQ.error as Error).message}
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {active.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              onChangeRole={(role) =>
                changeRole.mutate({ memberId: m.id, roleInProject: role })
              }
              onRemove={() => removeMember.mutate(m.id)}
              busy={changeRole.isPending || removeMember.isPending}
            />
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <details
          className="rounded-2xl p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <summary
            className="cursor-pointer text-[12px] font-semibold"
            style={{ color: T.textMuted }}
          >
            Колишні учасники ({inactive.length})
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {inactive.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-[12px]">
                <span style={{ color: T.textSecondary }}>
                  {m.user.name} · {ROLE_LABELS[m.roleInProject]}
                </span>
                <span style={{ color: T.textMuted }}>
                  {m.leftAt ? new Date(m.leftAt).toLocaleDateString("uk-UA") : ""}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {pickerOpen && (
        <AddMemberPicker
          projectId={projectId}
          existingUserIds={new Set(active.map((m) => m.userId))}
          onClose={() => setPickerOpen(false)}
          onAdd={async (userId, role) => {
            await addMutation.mutateAsync({ userId, roleInProject: role });
            setPickerOpen(false);
          }}
          busy={addMutation.isPending}
        />
      )}
    </div>
  );
}

function MemberCard({
  member,
  onChangeRole,
  onRemove,
  busy,
}: {
  member: ProjectMemberDTO;
  onChangeRole: (role: ProjectRole) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            {member.user.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span
              className="text-[14px] font-bold truncate"
              style={{ color: T.textPrimary }}
            >
              {member.user.name}
            </span>
            <span
              className="flex items-center gap-1 text-[11px] truncate"
              style={{ color: T.textMuted }}
            >
              <Mail size={11} /> {member.user.email}
            </span>
          </div>
        </div>
        <button
          onClick={onRemove}
          disabled={busy}
          title="Видалити з команди"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-125 disabled:opacity-50"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          РОЛЬ У ПРОЄКТІ
        </span>
        <select
          value={member.roleInProject}
          onChange={(e) => onChangeRole(e.target.value as ProjectRole)}
          disabled={busy}
          className="rounded-xl px-3 py-2 text-[13px] font-semibold disabled:opacity-50"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AddMemberPicker({
  existingUserIds,
  onClose,
  onAdd,
  busy,
}: {
  projectId: string;
  existingUserIds: Set<string>;
  onClose: () => void;
  onAdd: (userId: string, role: ProjectRole) => void;
  busy: boolean;
}) {
  const staffQ = useStaffUsers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState<ProjectRole>("ENGINEER");

  const candidates = (staffQ.data ?? []).filter((u) => !existingUserIds.has(u.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl p-6"
        style={{ backgroundColor: T.background, border: `1px solid ${T.borderStrong}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[16px] font-bold" style={{ color: T.textPrimary }}>
            Додати учасника
          </span>
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            Виберіть співробітника та роль у межах проєкту
          </span>
        </div>

        {staffQ.isLoading && (
          <div className="flex items-center justify-center py-6 text-xs" style={{ color: T.textMuted }}>
            <Loader2 size={14} className="animate-spin" />
          </div>
        )}

        {candidates.length === 0 && !staffQ.isLoading && (
          <div className="text-[12px]" style={{ color: T.textMuted }}>
            Усі співробітники вже у команді.
          </div>
        )}

        {candidates.length > 0 && (
          <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
            {candidates.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[12px] transition"
                style={{
                  backgroundColor: selectedId === u.id ? T.accentPrimarySoft : "transparent",
                  border: `1px solid ${selectedId === u.id ? T.accentPrimary : T.borderSoft}`,
                  color: T.textPrimary,
                }}
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="font-semibold truncate">{u.name}</span>
                  <span className="truncate text-[10px]" style={{ color: T.textMuted }}>
                    {u.email}
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: T.textMuted }}>
                  {u.role}
                </span>
              </button>
            ))}
          </div>
        )}

        {selectedId && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              РОЛЬ У ПРОЄКТІ
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ProjectRole)}
              className="rounded-xl px-3 py-2 text-[13px] font-semibold"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textSecondary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            Скасувати
          </button>
          <button
            disabled={!selectedId || busy}
            onClick={() => selectedId && onAdd(selectedId, role)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary, color: T.background }}
          >
            <Plus size={14} /> Додати
          </button>
        </div>
      </div>
    </div>
  );
}
