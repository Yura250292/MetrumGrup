/**
 * Maps notification types (used in create.ts) to preference categories
 * (used in user notification settings).
 */

export type NotificationCategory =
  | "taskAssignment"
  | "taskStatusChange"
  | "taskComment"
  | "mention"
  | "deadlineToday"
  | "overdueTask"
  | "chatMessage"
  | "projectChange"
  | "systemEvent"
  | "financeReview";

const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  PROJECT_UPDATED: "projectChange",
  PROJECT_FILE_ADDED: "projectChange",
  PROJECT_PHOTO_REPORT: "projectChange",
  PROJECT_ESTIMATE_CREATED: "financeReview",
  PROJECT_ESTIMATE_APPROVED: "financeReview",
  PROJECT_MEMBER_ADDED: "projectChange",
  PROJECT_COMMENT: "taskComment",
  TASK_ASSIGNED: "taskAssignment",
  TASK_COMMENTED: "taskComment",
  TASK_STATUS_CHANGED: "taskStatusChange",
  TASK_DUE_SOON: "deadlineToday",
  TASK_CREATED: "projectChange",
  COMMENT_MENTION: "mention",
  CHAT_MENTION: "mention",
  FINANCE_APPROVAL_NEEDED: "financeReview",
  FINANCE_APPROVAL_REMINDER: "financeReview",
  FINANCE_APPROVED: "financeReview",
  FINANCE_REJECTED: "financeReview",
};

export function notificationTypeToCategory(type: string): NotificationCategory {
  return TYPE_TO_CATEGORY[type] ?? "systemEvent";
}
