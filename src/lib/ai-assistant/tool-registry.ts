import type { Role } from "@prisma/client";
import type { AiToolName } from "./types";

export type ToolMeta = {
  name: AiToolName;
  type: "read" | "write";
  domain: "projects" | "tasks" | "finance" | "estimates" | "team" | "comments" | "resources" | "external" | "system";
  requiresConfirmation: boolean;
  allowedRoles: Role[];
  description: string;
};

const ALL_STAFF: Role[] = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER", "USER"];
const ADMINS: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];
const ALL: Role[] = [...ALL_STAFF, "CLIENT"];

export const TOOL_REGISTRY: ToolMeta[] = [
  // ── Read: Projects ──
  { name: "list_projects", type: "read", domain: "projects", requiresConfirmation: false, allowedRoles: ALL, description: "Список проєктів" },
  { name: "get_project_summary", type: "read", domain: "projects", requiresConfirmation: false, allowedRoles: ALL, description: "Деталі проєкту" },
  { name: "get_project_financials", type: "read", domain: "finance", requiresConfirmation: false, allowedRoles: ADMINS, description: "Фінанси проєкту" },
  { name: "get_stage_progress", type: "read", domain: "projects", requiresConfirmation: false, allowedRoles: ALL, description: "Етапи проєкту" },
  { name: "compare_projects", type: "read", domain: "projects", requiresConfirmation: false, allowedRoles: ADMINS, description: "Порівняння проєктів" },
  { name: "get_dashboard_kpis", type: "read", domain: "projects", requiresConfirmation: false, allowedRoles: ADMINS, description: "KPI дашборд" },
  { name: "get_financial_analysis", type: "read", domain: "finance", requiresConfirmation: false, allowedRoles: ADMINS, description: "Фінансовий аналіз" },

  // ── Read: Tasks ──
  { name: "get_task_list", type: "read", domain: "tasks", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Список завдань" },
  { name: "get_my_tasks", type: "read", domain: "tasks", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Мої завдання" },
  { name: "get_overdue_items", type: "read", domain: "tasks", requiresConfirmation: false, allowedRoles: ALL, description: "Прострочене" },
  { name: "get_team_workload", type: "read", domain: "team", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Навантаження команди" },
  { name: "get_global_team_overview", type: "read", domain: "team", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Глобальний огляд команди" },

  // ── Read: Estimates & Finance ──
  { name: "get_estimate_summary", type: "read", domain: "estimates", requiresConfirmation: false, allowedRoles: ALL, description: "Кошторис" },
  { name: "get_payment_status", type: "read", domain: "finance", requiresConfirmation: false, allowedRoles: [...ADMINS, "CLIENT"], description: "Статус платежів" },
  { name: "get_materials", type: "read", domain: "resources", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Матеріали" },

  // ── Read: Communications ──
  { name: "get_comments", type: "read", domain: "comments", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Коментарі" },
  { name: "get_time_logs", type: "read", domain: "team", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Часові логи" },
  { name: "get_workers", type: "read", domain: "resources", requiresConfirmation: false, allowedRoles: ADMINS, description: "Працівники" },
  { name: "get_project_files", type: "read", domain: "projects", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Файли проєкту" },
  { name: "get_photo_reports", type: "read", domain: "projects", requiresConfirmation: false, allowedRoles: ALL, description: "Фото-звіти" },

  // ── Write: Tasks ──
  { name: "create_task", type: "write", domain: "tasks", requiresConfirmation: true, allowedRoles: ALL_STAFF, description: "Створити завдання" },
  { name: "update_task", type: "write", domain: "tasks", requiresConfirmation: true, allowedRoles: ALL_STAFF, description: "Оновити завдання" },
  { name: "assign_task", type: "write", domain: "tasks", requiresConfirmation: true, allowedRoles: ALL_STAFF, description: "Призначити виконавця" },
  { name: "add_comment", type: "write", domain: "comments", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Додати коментар" },

  // ── Write: Projects ──
  { name: "create_project", type: "write", domain: "projects", requiresConfirmation: true, allowedRoles: ADMINS, description: "Створити проєкт" },
  { name: "update_project_stage", type: "write", domain: "projects", requiresConfirmation: true, allowedRoles: ALL_STAFF, description: "Оновити етап" },
  { name: "add_team_member", type: "write", domain: "team", requiresConfirmation: true, allowedRoles: ADMINS, description: "Додати учасника" },

  // ── Write: Finance ──
  { name: "schedule_payment", type: "write", domain: "finance", requiresConfirmation: true, allowedRoles: ADMINS, description: "Запланувати платіж" },
  { name: "mark_payment_paid", type: "write", domain: "finance", requiresConfirmation: true, allowedRoles: ADMINS, description: "Відмітити оплату" },
  { name: "record_expense", type: "write", domain: "finance", requiresConfirmation: true, allowedRoles: ADMINS, description: "Записати витрату" },

  // ── Write: System ──
  { name: "send_notification", type: "write", domain: "system", requiresConfirmation: true, allowedRoles: ADMINS, description: "Надіслати сповіщення" },

  // ── External ──
  { name: "web_search", type: "read", domain: "external", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Веб-пошук" },
  { name: "read_webpage", type: "read", domain: "external", requiresConfirmation: false, allowedRoles: ALL_STAFF, description: "Читання веб-сторінки" },
];

export function getToolMeta(name: AiToolName): ToolMeta | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export function isWriteTool(name: AiToolName): boolean {
  return getToolMeta(name)?.type === "write";
}

export function requiresConfirmation(name: AiToolName): boolean {
  return getToolMeta(name)?.requiresConfirmation ?? false;
}

export function isToolAllowedForRole(name: AiToolName, role: Role): boolean {
  const meta = getToolMeta(name);
  return meta ? meta.allowedRoles.includes(role) : false;
}
