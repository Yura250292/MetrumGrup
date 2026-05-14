"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectRole } from "@prisma/client";
import type { AssigneeRef } from "@/lib/assignees/types";

export type ProjectMemberDTO = {
  id: string;
  projectId: string;
  /** XOR: рівно одне з userId/employeeId. */
  userId: string | null;
  employeeId: string | null;
  roleInProject: ProjectRole;
  isActive: boolean;
  joinedAt: string;
  leftAt: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    role: string;
  } | null;
  employee: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    position: string | null;
  } | null;
  invitedBy: { id: string; name: string } | null;
};

const membersKey = (projectId: string) => ["project", projectId, "members"] as const;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: membersKey(projectId),
    queryFn: () =>
      jsonFetch<{ members: ProjectMemberDTO[] }>(
        `/api/admin/projects/${projectId}/members`,
      ).then((d) => d.members),
    enabled: !!projectId,
  });
}

export function useAddProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { assignee: AssigneeRef; roleInProject: ProjectRole }) => {
      const body =
        input.assignee.kind === "user"
          ? { userId: input.assignee.id, roleInProject: input.roleInProject }
          : { employeeId: input.assignee.id, roleInProject: input.roleInProject };
      return jsonFetch<{ member: ProjectMemberDTO }>(
        `/api/admin/projects/${projectId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ).then((d) => d.member);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(projectId) });
    },
  });
}

export function useChangeMemberRole(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { memberId: string; roleInProject: ProjectRole }) =>
      jsonFetch<{ member: ProjectMemberDTO }>(
        `/api/admin/projects/${projectId}/members/${input.memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleInProject: input.roleInProject }),
        },
      ).then((d) => d.member),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(projectId) });
    },
  });
}

export function useRemoveMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      jsonFetch<{ ok: true }>(
        `/api/admin/projects/${projectId}/members/${memberId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(projectId) });
    },
  });
}
