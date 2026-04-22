// Prompt builders for AI actions in task drawer and My Tasks page.
// Keep inputs minimal — AI tools can fetch deeper context via get_task_list/get_project_summary.

export type TaskContextForAi = {
  id: string;
  title: string;
  description?: string | null;
  status: { name: string };
  priority: string;
  dueDate?: string | null;
  project?: { id: string; title: string } | null;
  assignees?: { user: { name: string } }[];
  checklist?: { content: string; isDone: boolean }[];
  stage?: { stage: string };
};

function formatTaskContext(t: TaskContextForAi): string {
  const assignees = (t.assignees ?? []).map((a) => a.user.name).join(", ") || "—";
  const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString("uk-UA") : "—";
  const checklistSummary =
    t.checklist && t.checklist.length > 0
      ? t.checklist
          .slice(0, 10)
          .map((c) => `- [${c.isDone ? "x" : " "}] ${c.content}`)
          .join("\n")
      : "—";
  return [
    `Задача: ${t.title}`,
    `Статус: ${t.status.name} (пріоритет ${t.priority})`,
    `Дедлайн: ${due}`,
    t.project ? `Проєкт: ${t.project.title} (id: ${t.project.id})` : "",
    `Виконавці: ${assignees}`,
    t.stage ? `Етап: ${t.stage.stage}` : "",
    t.description ? `\nОпис:\n${t.description}` : "",
    `\nЧекліст:\n${checklistSummary}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const SOURCE_RULE =
  "\n\nВажливе правило: чітко розділяй (1) дані з БД компанії, (2) знайдене в інтернеті, (3) твою рекомендацію.";

export type TaskAiAction =
  | "explain"
  | "breakdown"
  | "today"
  | "blockers"
  | "who-to-involve"
  | "message"
  | "checklist"
  | "regulations"
  | "material-analogs"
  | "suppliers";

const ACTION_INSTRUCTIONS: Record<TaskAiAction, string> = {
  explain:
    "Коротко (3-5 речень) поясни суть цієї задачі з точки зору конкретних дій: що вона означає, чому вона важлива, що буде результатом.",
  breakdown:
    "Розбий цю задачу на 5-8 конкретних послідовних кроків. На кожному кроці: дія, очікуваний результат. Без води.",
  today:
    "Виходячи з поточного стану задачі (статус, чекліст, блокери) — що саме треба зробити сьогодні, щоб просунути її? 1-3 конкретні дії.",
  blockers:
    "Проаналізуй: що може блокувати цю задачу? Подивись на залежності, чекліст, статус, описання. Поверни короткий список потенційних блокерів і що з ними робити.",
  "who-to-involve":
    "Кого в команді треба підключити, щоб задача зрушилась? Подивись на проєкт, етап, роль виконавця. Використай tool get_project_summary якщо потрібно. Поверни 2-5 людей/ролей з коротким поясненням навіщо.",
  message:
    "Сформуй коротке (3-6 речень) повідомлення в робочий чат або email щоб запитати апдейт/делегувати/повідомити статус по цій задачі. Мова — українська, ділова але дружня.",
  checklist:
    "Склади для цієї задачі чекліст з 5-10 конкретних пунктів у форматі '- [ ] крок'. Без загальних фраз, тільки дії.",
  regulations: `Знайди актуальні нормативні документи (ДБН, ДСТУ, ГОСТ, СНиП) що стосуються цієї задачі. Обов'язково використай інструмент web_search, потім read_webpage для деталей. Поверни 3-5 посилань з коротким описом.${SOURCE_RULE}`,
  "material-analogs": `Знайди аналоги матеріалів що згадуються в цій задачі (або на проєкті). Використай web_search. Поверни 3-5 варіантів з характеристиками, орієнтовною ціною та постачальниками.${SOURCE_RULE}`,
  suppliers: `Знайди постачальників/підрядників що можуть виконати роботи по цій задачі в Україні. Використай web_search + read_webpage. Поверни 3-5 варіантів з контактами, сайтами, спеціалізацією.${SOURCE_RULE}`,
};

export function buildTaskPrompt(action: TaskAiAction, task: TaskContextForAi): string {
  return `${ACTION_INSTRUCTIONS[action]}\n\n---\n${formatTaskContext(task)}`;
}

// Prompts for the page-level "AI day summary" buttons.
export const DAY_SUMMARY_PROMPTS = {
  priorities:
    "Подивись на мої активні задачі (tool: get_task_list). Поверни мої 5 головних пріоритетів на сьогодні у форматі нумерованого списку: задача, чому саме вона, перший крок.",
  stalled:
    "Подивись на мої задачі (get_task_list). Знайди ті, що зависли: давно не оновлювались, прострочені, або заблоковані. Поверни список з коротким поясненням чому кожна застрягла.",
  "blocking-team":
    "Які з моїх задач блокують роботу колег? Використай get_task_list щоб знайти ті, де я предецесор для інших. Повернуть список з поясненням хто чекає і що треба зробити.",
  delegate:
    "Які з моїх задач можна делегувати? Підкажи кандидатури з команди (використай get_project_summary щоб побачити хто в проєктах). Поверни: задача, кому делегувати, чому саме йому.",
  "close-today":
    "Які задачі реально можна закрити сьогодні? Подивись на мої задачі (get_task_list) де залишилось мало кроків або вони вже майже виконані. Поверни 3-5 задач з конкретними останніми кроками.",
  summary:
    "AI-резюме дня. Використай get_task_list. Поверни у вигляді: (1) 3 головні пріоритети, (2) 3 ризики/блокери, (3) 3 наступні дії на сьогодні. Структуровано, коротко.",
} as const;
