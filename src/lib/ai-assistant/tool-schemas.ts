import { z } from "zod";
import type { AiToolName } from "./types";

/** Runtime validation schemas for tool inputs. User-friendly error messages. */

const projectId = z.string().min(1, "ID проєкту обов'язковий");
const taskId = z.string().min(1, "ID завдання обов'язковий");

const schemas: Partial<Record<AiToolName, z.ZodType>> = {
  list_projects: z.object({
    search: z.string().optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
    limit: z.number().min(1).max(50).optional(),
  }),
  get_project_summary: z.object({ projectId }),
  get_project_financials: z.object({ projectId }),
  get_task_list: z.object({
    projectId,
    status: z.string().optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    assigneeId: z.string().optional(),
    limit: z.number().min(1).max(50).optional(),
  }),
  get_my_tasks: z.object({ limit: z.number().min(1).max(50).optional() }),
  get_team_workload: z.object({ projectId, daysBack: z.number().optional() }),
  get_estimate_summary: z.object({ projectId }),
  get_payment_status: z.object({ projectId }),
  get_stage_progress: z.object({ projectId }),
  get_dashboard_kpis: z.object({}),
  compare_projects: z.object({
    projectIds: z.array(z.string()).min(2, "Потрібно мінімум 2 проєкти").max(5, "Максимум 5 проєктів"),
  }),
  get_overdue_items: z.object({ projectId: z.string().optional() }),
  get_financial_analysis: z.object({ daysBack: z.number().optional() }),
  get_comments: z.object({
    entityType: z.enum(["TASK", "PROJECT", "ESTIMATE"], { error: "Тип сутності обов'язковий" }),
    entityId: z.string().min(1, "ID сутності обов'язковий"),
    limit: z.number().optional(),
  }),
  get_time_logs: z.object({
    projectId,
    userId: z.string().optional(),
    daysBack: z.number().optional(),
  }),
  get_workers: z.object({ projectId: z.string().optional() }),
  get_materials: z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    limit: z.number().optional(),
  }),
  web_search: z.object({
    query: z.string().min(2, "Пошуковий запит занадто короткий"),
    location: z.string().optional(),
  }),
  create_task: z.object({
    projectId,
    title: z.string().min(1, "Назва завдання обов'язкова"),
    description: z.string().optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    dueDate: z.string().optional(),
  }),
  update_task: z.object({
    taskId,
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    dueDate: z.string().optional(),
    statusName: z.string().optional(),
  }),
  assign_task: z.object({
    taskId,
    userId: z.string().min(1, "ID користувача обов'язковий"),
    action: z.enum(["add", "remove"]).optional(),
  }),
  add_comment: z.object({
    entityType: z.enum(["TASK", "PROJECT", "ESTIMATE"]),
    entityId: z.string().min(1),
    body: z.string().min(1, "Текст коментаря обов'язковий"),
  }),
  create_project: z.object({
    title: z.string().min(1, "Назва проєкту обов'язкова"),
    description: z.string().optional(),
    address: z.string().optional(),
    totalBudget: z.number().optional(),
    clientId: z.string().optional(),
  }),
  update_project_stage: z.object({
    projectId,
    stage: z.enum(["DESIGN", "FOUNDATION", "WALLS", "ROOF", "ENGINEERING", "FINISHING", "HANDOVER"]),
    progress: z.number().min(0).max(100).optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
  }),
  add_team_member: z.object({
    projectId,
    userId: z.string().min(1),
    role: z.enum(["PROJECT_ADMIN", "PROJECT_MANAGER", "ENGINEER", "FOREMAN", "FINANCE", "PROCUREMENT", "VIEWER"]),
  }),
  schedule_payment: z.object({
    projectId,
    amount: z.number().positive("Сума повинна бути більше 0"),
    scheduledDate: z.string().min(1, "Дата платежу обов'язкова"),
    description: z.string().optional(),
    method: z.enum(["BANK_TRANSFER", "CASH", "CARD"]).optional(),
  }),
  mark_payment_paid: z.object({
    paymentId: z.string().min(1, "ID платежу обов'язковий"),
  }),
  record_expense: z.object({
    projectId,
    amount: z.number().positive("Сума повинна бути більше 0"),
    category: z.string().min(1, "Категорія обов'язкова"),
    description: z.string().optional(),
    occurredAt: z.string().optional(),
  }),
  send_notification: z.object({
    title: z.string().min(1, "Заголовок обов'язковий"),
    message: z.string().min(1, "Текст обов'язковий"),
    userId: z.string().optional(),
    projectId: z.string().optional(),
  }),
};

/**
 * Validate tool input against Zod schema.
 * Returns cleaned data on success, throws user-friendly error on failure.
 */
export function validateToolInput(toolName: AiToolName, input: Record<string, unknown>): Record<string, unknown> {
  const schema = schemas[toolName];
  if (!schema) return input; // no schema defined — pass through

  const result = schema.safeParse(input);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(". ");
    throw new Error(messages);
  }
  return result.data as Record<string, unknown>;
}
