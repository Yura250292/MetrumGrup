import {
  Shield,
  Users as UsersIcon,
  User as UserIcon,
  Wrench,
  Calculator,
  HardHat,
  type LucideIcon,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адміністратор",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
  HR: "HR",
  FOREMAN: "Виконроб",
  USER: "Користувач",
  CLIENT: "Клієнт",
};

export const ROLE_ICONS: Record<string, LucideIcon> = {
  SUPER_ADMIN: Shield,
  MANAGER: UsersIcon,
  ENGINEER: Wrench,
  FINANCIER: Calculator,
  HR: UsersIcon,
  FOREMAN: HardHat,
  USER: UserIcon,
  CLIENT: UserIcon,
};

export const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  SUPER_ADMIN: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  MANAGER: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  ENGINEER: { bg: T.successSoft, fg: T.success },
  FINANCIER: { bg: T.warningSoft, fg: T.warning },
  HR: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  FOREMAN: { bg: T.successSoft, fg: T.success },
  USER: { bg: T.panelElevated, fg: T.textMuted },
  CLIENT: { bg: T.panelElevated, fg: T.textMuted },
};

const ALL_ROLES = [
  "SUPER_ADMIN",
  "MANAGER",
  "ENGINEER",
  "FINANCIER",
  "HR",
  "FOREMAN",
  "USER",
  "CLIENT",
] as const;

export type AssignableRole = (typeof ALL_ROLES)[number];

export function canAssignRole(
  actorRole: string | undefined,
  targetRole: string,
): boolean {
  if (!actorRole) return false;
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "MANAGER") return targetRole !== "SUPER_ADMIN";
  if (actorRole === "HR") {
    return ["USER", "ENGINEER", "FINANCIER", "HR", "FOREMAN"].includes(targetRole);
  }
  return false;
}

export function assignableRolesFor(actorRole: string | undefined): AssignableRole[] {
  return ALL_ROLES.filter((r) => canAssignRole(actorRole, r));
}
