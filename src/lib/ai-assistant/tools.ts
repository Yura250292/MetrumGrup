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
  "Отримати список проєктів. Можна шукати по назві. Повертає назву, адресу, статус, етап, бюджет та прогрес.",
  {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "Пошук по назві проєкту (наприклад: 'АТБ', 'Гірник'). Шукає часткове співпадіння.",
      },
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

const getGlobalTeamOverview = fn(
  "get_global_team_overview",
  "Глобальний огляд команди по ВСІХ проєктах: хто на якому проєкті працює, роль, кількість активних завдань, останні дії. Не потребує projectId.",
  { type: "object", properties: {} },
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

const readWebpage = fn(
  "read_webpage",
  "Відкрити веб-сторінку за URL і прочитати її текстовий вміст. Використовуй після web_search щоб подивитись ціни, контакти, деталі на знайденому сайті.",
  {
    type: "object",
    properties: {
      url: { type: "string", description: "URL сторінки для читання (наприклад: 'https://example.com/prices')" },
    },
    required: ["url"],
  },
);

const webSearch = fn(
  "web_search",
  "Пошук в інтернеті: підрядники, ціни на матеріали, бригади, техніка, оголошення OLX/Prom.ua, будівельні послуги. Повертає реальні результати з URL-посиланнями. Після пошуку використовуй read_webpage щоб відкрити сайт і прочитати деталі/ціни.",
  {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Пошуковий запит українською або англійською (наприклад: 'демонтаж стін Київ ціна 2024')",
      },
      location: {
        type: "string",
        description: "Локація для пошуку (місто, район) — додається до запиту якщо вказана",
      },
    },
    required: ["query"],
  },
);

const getFinancialAnalysis = fn(
  "get_financial_analysis",
  "Повний фінансовий аналіз: всі надходження/витрати по всіх проєктах, рентабельність, тренди, категорії витрат. Для стратегічних рішень.",
  {
    type: "object",
    properties: {
      daysBack: {
        type: "number",
        description: "Період аналізу в днях (за замовчуванням 90)",
      },
    },
  },
);

const createTask = fn(
  "create_task",
  "Створити нове завдання в проєкті. Використовуй коли користувач просить створити задачу/таску.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
      title: { type: "string", description: "Назва завдання" },
      description: { type: "string", description: "Опис завдання (необов'язково)" },
      priority: {
        type: "string",
        enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        description: "Пріоритет (за замовчуванням NORMAL)",
      },
      dueDate: { type: "string", description: "Дедлайн у форматі YYYY-MM-DD (необов'язково)" },
    },
    required: ["projectId", "title"],
  },
);

const schedulePayment = fn(
  "schedule_payment",
  "Запланувати платіж для проєкту. Використовуй коли користувач просить додати/запланувати оплату.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
      amount: { type: "number", description: "Сума платежу в гривнях" },
      scheduledDate: { type: "string", description: "Дата платежу у форматі YYYY-MM-DD" },
      description: { type: "string", description: "Опис платежу (наприклад: 'Оплата за матеріали')" },
      method: {
        type: "string",
        enum: ["BANK_TRANSFER", "CASH", "CARD"],
        description: "Метод оплати (за замовчуванням BANK_TRANSFER)",
      },
    },
    required: ["projectId", "amount", "scheduledDate"],
  },
);

// ── NEW: Write actions ────────────────────────────────────────

const updateTask = fn(
  "update_task",
  "Оновити завдання: змінити статус, пріоритет, дедлайн, опис. Використовуй для 'зроби завдання терміновим', 'зміни дедлайн', 'закрий завдання'.",
  {
    type: "object",
    properties: {
      taskId: { type: "string", description: "ID завдання" },
      title: { type: "string", description: "Нова назва (необов'язково)" },
      description: { type: "string", description: "Новий опис (необов'язково)" },
      priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"], description: "Новий пріоритет" },
      dueDate: { type: "string", description: "Новий дедлайн YYYY-MM-DD" },
      statusName: { type: "string", description: "Назва нового статусу (наприклад: 'В роботі', 'Завершено')" },
    },
    required: ["taskId"],
  },
);

const assignTask = fn(
  "assign_task",
  "Призначити виконавця на завдання або зняти. Потрібен userId виконавця.",
  {
    type: "object",
    properties: {
      taskId: { type: "string", description: "ID завдання" },
      userId: { type: "string", description: "ID користувача для призначення" },
      action: { type: "string", enum: ["add", "remove"], description: "Додати або зняти (за замовч. add)" },
    },
    required: ["taskId", "userId"],
  },
);

const addComment = fn(
  "add_comment",
  "Додати коментар до завдання, проєкту або кошторису. Для комунікації з командою.",
  {
    type: "object",
    properties: {
      entityType: { type: "string", enum: ["TASK", "PROJECT", "ESTIMATE"], description: "Тип сутності" },
      entityId: { type: "string", description: "ID сутності (завдання, проєкту, кошторису)" },
      body: { type: "string", description: "Текст коментаря" },
    },
    required: ["entityType", "entityId", "body"],
  },
);

const createProject = fn(
  "create_project",
  "Створити новий проєкт. Потрібна назва, адреса, бюджет.",
  {
    type: "object",
    properties: {
      title: { type: "string", description: "Назва проєкту" },
      description: { type: "string", description: "Опис проєкту" },
      address: { type: "string", description: "Адреса об'єкту" },
      totalBudget: { type: "number", description: "Загальний бюджет в гривнях" },
      clientId: { type: "string", description: "ID клієнта (необов'язково)" },
    },
    required: ["title"],
  },
);

const updateProjectStage = fn(
  "update_project_stage",
  "Оновити прогрес етапу проєкту (Проєктування, Фундамент, Стіни тощо).",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
      stage: { type: "string", enum: ["DESIGN", "FOUNDATION", "WALLS", "ROOF", "ENGINEERING", "FINISHING", "HANDOVER"], description: "Етап" },
      progress: { type: "number", description: "Прогрес у відсотках (0-100)" },
      status: { type: "string", enum: ["PENDING", "IN_PROGRESS", "COMPLETED"], description: "Статус етапу" },
    },
    required: ["projectId", "stage"],
  },
);

const addTeamMember = fn(
  "add_team_member",
  "Додати учасника до команди проєкту з роллю.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
      userId: { type: "string", description: "ID користувача" },
      role: { type: "string", enum: ["PROJECT_ADMIN", "PROJECT_MANAGER", "ENGINEER", "FOREMAN", "FINANCE", "PROCUREMENT", "VIEWER"], description: "Роль в проєкті" },
    },
    required: ["projectId", "userId", "role"],
  },
);

const markPaymentPaid = fn(
  "mark_payment_paid",
  "Відмітити платіж як сплачений.",
  {
    type: "object",
    properties: {
      paymentId: { type: "string", description: "ID платежу" },
    },
    required: ["paymentId"],
  },
);

const recordExpense = fn(
  "record_expense",
  "Записати фактичну витрату по проєкту (матеріали, зарплата, логістика тощо).",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
      amount: { type: "number", description: "Сума витрати" },
      category: { type: "string", description: "Категорія: materials, salary, rent, equipment, logistics, taxes, other" },
      description: { type: "string", description: "Опис витрати" },
      occurredAt: { type: "string", description: "Дата витрати YYYY-MM-DD (за замовчуванням сьогодні)" },
    },
    required: ["projectId", "amount", "category"],
  },
);

const sendNotification = fn(
  "send_notification",
  "Надіслати сповіщення користувачу або команді проєкту.",
  {
    type: "object",
    properties: {
      userId: { type: "string", description: "ID конкретного користувача (або вказати projectId для всієї команди)" },
      projectId: { type: "string", description: "ID проєкту — сповістити всю команду" },
      title: { type: "string", description: "Заголовок сповіщення" },
      message: { type: "string", description: "Текст сповіщення" },
    },
    required: ["title", "message"],
  },
);

// ── NEW: Deep read tools ──────────────────────────────────────

const getComments = fn(
  "get_comments",
  "Отримати коментарі до завдання, проєкту або кошторису. Для розуміння обговорення.",
  {
    type: "object",
    properties: {
      entityType: { type: "string", enum: ["TASK", "PROJECT", "ESTIMATE"], description: "Тип сутності" },
      entityId: { type: "string", description: "ID сутності" },
      limit: { type: "number", description: "Кількість (за замовч. 20)" },
    },
    required: ["entityType", "entityId"],
  },
);

const getTimeLogs = fn(
  "get_time_logs",
  "Детальні часові логи: хто, коли, скільки годин, на яке завдання, вартість.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID проєкту" },
      userId: { type: "string", description: "ID конкретного користувача (необов'язково)" },
      daysBack: { type: "number", description: "Період в днях (за замовч. 30)" },
    },
    required: ["projectId"],
  },
);

const getWorkers = fn(
  "get_workers",
  "Список працівників/бригад: ім'я, спеціальність, денна ставка, поточний проєкт.",
  {
    type: "object",
    properties: {
      projectId: { type: "string", description: "Фільтр по проєкту (необов'язково)" },
    },
  },
);

const getMaterials = fn(
  "get_materials",
  "База матеріалів з цінами, артикулами, одиницями виміру. Для порівняння цін та підбору.",
  {
    type: "object",
    properties: {
      search: { type: "string", description: "Пошук по назві або артикулу" },
      category: { type: "string", description: "Фільтр по категорії" },
      limit: { type: "number", description: "Кількість (за замовч. 30)" },
    },
  },
);

const saveMemory = fn(
  "save_memory",
  "Зберегти вподобання або нотатку користувача для майбутніх розмов. Наприклад: улюблений проєкт, стиль відповідей, важливі контакти.",
  {
    type: "object",
    properties: {
      key: { type: "string", description: "Ключ (наприклад: 'favorite_project', 'response_style', 'important_contact')" },
      value: { type: "string", description: "Значення для запам'ятовування" },
    },
    required: ["key", "value"],
  },
);

const getMemories = fn(
  "get_memories",
  "Отримати збережені вподобання та нотатки користувача.",
  { type: "object", properties: {} },
);

const ADMIN_TOOLS: ToolDef[] = [
  // Read
  listProjects, getProjectSummary, getProjectFinancials,
  getTaskList, getMyTasks, getTeamWorkload, getGlobalTeamOverview,
  getEstimateSummary, getPaymentStatus, getStageProgress,
  getDashboardKpis, compareProjects, getOverdueItems,
  getFinancialAnalysis, getComments, getTimeLogs,
  getWorkers, getMaterials,
  // Write
  createTask, updateTask, assignTask, addComment,
  createProject, updateProjectStage, addTeamMember,
  schedulePayment, markPaymentPaid, recordExpense,
  sendNotification,
  // External + Memory
  webSearch, readWebpage, saveMemory, getMemories,
];

const STAFF_TOOLS: ToolDef[] = [
  listProjects, getProjectSummary,
  getTaskList, getMyTasks, getTeamWorkload, getGlobalTeamOverview,
  getEstimateSummary, getStageProgress,
  getComments, getTimeLogs, getMaterials,
  createTask, updateTask, addComment,
  webSearch, readWebpage, saveMemory, getMemories,
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
