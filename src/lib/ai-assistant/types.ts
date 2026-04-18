import type { Role } from "@prisma/client";

export type AiToolName =
  // Read — projects
  | "list_projects"
  | "get_project_summary"
  | "get_project_financials"
  | "get_stage_progress"
  | "compare_projects"
  | "get_dashboard_kpis"
  | "get_financial_analysis"
  // Read — tasks
  | "get_task_list"
  | "get_my_tasks"
  | "get_overdue_items"
  | "get_team_workload"
  | "get_global_team_overview"
  // Read — estimates & materials
  | "get_estimate_summary"
  | "get_payment_status"
  | "get_materials"
  // Read — communications
  | "get_comments"
  | "get_time_logs"
  // Read — resources
  | "get_workers"
  // Write — tasks
  | "create_task"
  | "update_task"
  | "assign_task"
  | "add_comment"
  // Write — projects
  | "create_project"
  | "update_project_stage"
  | "add_team_member"
  // Write — finance
  | "schedule_payment"
  | "mark_payment_paid"
  | "record_expense"
  // External
  | "web_search"
  | "send_notification"
  // Memory
  | "save_memory"
  | "get_memories";

export type AiChatRequest = {
  conversationId?: string;
  message: string;
  projectId?: string;
};

export type AiUserContext = {
  userId: string;
  userName: string;
  role: Role;
};

export type ToolCallRecord = {
  toolName: string;
  input: Record<string, unknown>;
  result: unknown;
};

export type SSEEvent =
  | { event: "text"; data: string }
  | { event: "tool_use"; data: { toolName: string } }
  | { event: "done"; data: { conversationId: string; tokenUsage?: { inputTokens: number; outputTokens: number } } }
  | { event: "error"; data: { message: string } };
