import type { Role } from "@prisma/client";
import type OpenAI from "openai";

type ToolDef = OpenAI.ChatCompletionTool;

function fn(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): ToolDef {
  return {
    type: "function",
    function: { name, description, parameters },
  };
}

const listProjects = fn(
  "list_projects",
  "Отримати список проєктів. Повертає назву, статус, етап, бюджет та прогрес кожного проєкту.",
  {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"],
        description: "Фільтр по статусу проєкту (необов'язково)",
      },
      limit: {
        type: "number",
        description: "Максимальна кількість проєктів (за замовчуванням 20)",
      },
    },
  },
);

const getProjectSummary = fn(
  "get_project_summary",
  "Отримати детальну інформацію про конкретний проєкт: назва, адреса, бюджет, сплачено, етап, прогрес, команда, клієнт, менеджер.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
    },
    required: ["projectId"],
  },
);

const getProjectFinancials = fn(
  "get_project_financials",
  "Фінансові дані проєкту: бюджет vs фактичні витрати, доходи/витрати по категоріях, платежі.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
    },
    required: ["projectId"],
  },
);

const getTaskList = fn(
  "get_task_list",
  "Список завдань проєкту з фільтрами по статусу, пріоритету, призначенню. Повертає назву, статус, пріоритет, призначених, дедлайн.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
      status: { type: "string", description: "Фільтр по статусу завдання (назва статусу)" },
      priority: {
        type: "string",
        enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        description: "Фільтр по пріоритету",
      },
      assigneeId: { type: "string", description: "ID виконавця для фільтрації" },
      limit: { type: "number", description: "Максимальна кількість (за замовчуванням 30)" },
    },
    required: ["projectId"],
  },
);

const getMyTasks = fn(
  "get_my_tasks",
  "Мої призначені завдання по всіх проєктах. Показує пріоритетні та прострочені першими.",
  {
    type: "object",
    properties: {
      limit: { type: "number", description: "Максимальна кількість (за замовчуванням 30)" },
    },
  },
);

const getTeamWorkload = fn(
  "get_team_workload",
  "Навантаження команди проєкту: години кожного учасника за період, вартість, розподіл по завданнях.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
      daysBack: { type: "number", description: "Кількість днів назад (за замовчуванням 30)" },
    },
    required: ["projectId"],
  },
);

const getEstimateSummary = fn(
  "get_estimate_summary",
  "Підсумок кошторису проєкту: секції, загальна сума матеріалів, робіт, накладних, знижка, фінальна сума.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
    },
    required: ["projectId"],
  },
);

const getPaymentStatus = fn(
  "get_payment_status",
  "Статус платежів проєкту: заплановані, сплачені, прострочені суми та дати.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
    },
    required: ["projectId"],
  },
);

const getStageProgress = fn(
  "get_stage_progress",
  "Прогрес по етапах будівництва проєкту: статус кожного етапу, дати початку/завершення, нотатки.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
    },
    required: ["projectId"],
  },
);

const getDashboardKpis = fn(
  "get_dashboard_kpis",
  "KPI дашборду платформи: кількість проєктів (всього/активних/завершених), загальний бюджет, виручка, кількість клієнтів, прострочені платежі, активні завдання.",
  { type: "object", properties: {} },
);

const compareProjects = fn(
  "compare_projects",
  "Порівняння кількох проєктів: бюджет, сплачено, прогрес, кількість завдань, рентабельність.",
  {
    type: "object",
    properties: {
      projectIds: {
        type: "array",
        items: { type: "string" },
        description: "Масив ID проєктів для порівняння (2-5)",
      },
    },
    required: ["projectIds"],
  },
);

const getOverdueItems = fn(
  "get_overdue_items",
  "Прострочені елементи: платежі після дедлайну, завдання після дедлайну.",
  {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту (необов'язково — без нього шукає по всіх доступних)",
      },
    },
  },
);

const ADMIN_TOOLS: ToolDef[] = [
  listProjects,
  getProjectSummary,
  getProjectFinancials,
  getTaskList,
  getMyTasks,
  getTeamWorkload,
  getEstimateSummary,
  getPaymentStatus,
  getStageProgress,
  getDashboardKpis,
  compareProjects,
  getOverdueItems,
];

const STAFF_TOOLS: ToolDef[] = [
  listProjects,
  getProjectSummary,
  getTaskList,
  getMyTasks,
  getTeamWorkload,
  getEstimateSummary,
  getStageProgress,
];

const CLIENT_TOOLS: ToolDef[] = [
  listProjects,
  getProjectSummary,
  getEstimateSummary,
  getPaymentStatus,
  getStageProgress,
];

export function getToolsForRole(role: Role): ToolDef[] {
  switch (role) {
    case "SUPER_ADMIN":
    case "MANAGER":
    case "FINANCIER":
      return ADMIN_TOOLS;
    case "ENGINEER":
    case "USER":
      return STAFF_TOOLS;
    case "CLIENT":
      return CLIENT_TOOLS;
    default:
      return CLIENT_TOOLS;
  }
}
