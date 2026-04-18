import type { Role } from "@prisma/client";
import type Anthropic from "@anthropic-ai/sdk";

type ToolDef = Anthropic.Tool;

const listProjects: ToolDef = {
  name: "list_projects",
  description:
    "Отримати список проєктів. Повертає назву, статус, етап, бюджет та прогрес кожного проєкту.",
  input_schema: {
    type: "object" as const,
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
    required: [],
  },
};

const getProjectSummary: ToolDef = {
  name: "get_project_summary",
  description:
    "Отримати детальну інформацію про конкретний проєкт: назва, адреса, бюджет, сплачено, етап, прогрес, команда, клієнт, менеджер.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту",
      },
    },
    required: ["projectId"],
  },
};

const getProjectFinancials: ToolDef = {
  name: "get_project_financials",
  description:
    "Фінансові дані проєкту: бюджет vs фактичні витрати, доходи/витрати по категоріях, платежі.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту",
      },
    },
    required: ["projectId"],
  },
};

const getTaskList: ToolDef = {
  name: "get_task_list",
  description:
    "Список завдань проєкту з фільтрами по статусу, пріоритету, призначенню. Повертає назву, статус, пріоритет, призначених, дедлайн.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту",
      },
      status: {
        type: "string",
        description: "Фільтр по статусу завдання (назва статусу)",
      },
      priority: {
        type: "string",
        enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        description: "Фільтр по пріоритету",
      },
      assigneeId: {
        type: "string",
        description: "ID виконавця для фільтрації",
      },
      limit: {
        type: "number",
        description: "Максимальна кількість (за замовчуванням 30)",
      },
    },
    required: ["projectId"],
  },
};

const getMyTasks: ToolDef = {
  name: "get_my_tasks",
  description:
    "Мої призначені завдання по всіх проєктах. Показує пріоритетні та прострочені першими.",
  input_schema: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Максимальна кількість (за замовчуванням 30)",
      },
    },
    required: [],
  },
};

const getTeamWorkload: ToolDef = {
  name: "get_team_workload",
  description:
    "Навантаження команди проєкту: години кожного учасника за період, вартість, розподіл по завданнях.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту",
      },
      daysBack: {
        type: "number",
        description: "Кількість днів назад (за замовчуванням 30)",
      },
    },
    required: ["projectId"],
  },
};

const getEstimateSummary: ToolDef = {
  name: "get_estimate_summary",
  description:
    "Підсумок кошторису проєкту: секції, загальна сума матеріалів, робіт, накладних, знижка, фінальна сума.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту",
      },
    },
    required: ["projectId"],
  },
};

const getPaymentStatus: ToolDef = {
  name: "get_payment_status",
  description:
    "Статус платежів проєкту: заплановані, сплачені, прострочені суми та дати.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту",
      },
    },
    required: ["projectId"],
  },
};

const getStageProgress: ToolDef = {
  name: "get_stage_progress",
  description:
    "Прогрес по етапах будівництва проєкту: статус кожного етапу, дати початку/завершення, нотатки.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту",
      },
    },
    required: ["projectId"],
  },
};

const getDashboardKpis: ToolDef = {
  name: "get_dashboard_kpis",
  description:
    "KPI дашборду платформи: кількість проєктів (всього/активних/завершених), загальний бюджет, виручка, кількість клієнтів, прострочені платежі, активні завдання.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

const compareProjects: ToolDef = {
  name: "compare_projects",
  description:
    "Порівняння кількох проєктів: бюджет, сплачено, прогрес, кількість завдань, рентабельність.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectIds: {
        type: "array",
        items: { type: "string" },
        description: "Масив ID проєктів для порівняння (2-5)",
      },
    },
    required: ["projectIds"],
  },
};

const getOverdueItems: ToolDef = {
  name: "get_overdue_items",
  description:
    "Прострочені елементи: платежі після дедлайну, завдання після дедлайну.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "ID проєкту (необов'язково — без нього шукає по всіх доступних)",
      },
    },
    required: [],
  },
};

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
