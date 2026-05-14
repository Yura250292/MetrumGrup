import type { Role } from "@prisma/client";

/**
 * Polymorphic FK на User або Employee. Передається у write-API замість прямого
 * userId, щоб дозволити призначати HR-співробітників без CRM-облікового запису.
 */
export type AssigneeRef =
  | { kind: "user"; id: string }
  | { kind: "employee"; id: string };

/**
 * Уніфікований кандидат для дропдаунів вибору відповідального. Зливає
 * User-ів та Employee-без-User в один список з бейджем hasAccount.
 *
 * - kind="user": User-обліковий запис. Якщо повʼязаний з Employee, то
 *   `position` піднято з Employee. `hasAccount` = true.
 * - kind="employee": Employee без CRM-облікового запису. `role` = null,
 *   `hasAccount` = false. У UI помічається бейджем "без акаунту".
 */
export type AssigneeCandidate = {
  kind: "user" | "employee";
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role | null;
  position: string | null;
  departmentId: string | null;
  hasAccount: boolean;
};
