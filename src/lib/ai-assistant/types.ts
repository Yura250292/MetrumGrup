import type { Role } from "@prisma/client";

export type AiToolName =
  | "list_projects"
  | "get_project_summary"
  | "get_project_financials"
  | "get_task_list"
  | "get_my_tasks"
  | "get_team_workload"
  | "get_estimate_summary"
  | "get_payment_status"
  | "get_stage_progress"
  | "get_dashboard_kpis"
  | "compare_projects"
  | "get_overdue_items"
  | "web_search"
  | "get_financial_analysis"
  | "create_task"
  | "schedule_payment";

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
