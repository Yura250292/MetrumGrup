/// Safe Finance Migration — Phase 1 freeze switch.
///
/// Коли OFF (за замовч.): створення естімейтів і вперше-публікація стейджів
/// НЕ створюють FinanceEntry автоматично. Бюджет матеріалізується тільки
/// явними діями користувача через окремі ендпойнти.
///
/// Коли ON: збережена попередня поведінка авто-синку.
///
/// Прапор контролюється тільки через env, без runtime-toggle, щоб
/// гарантувати детерміновану поведінку у тестах і скриптах.
export function isFinanceAutopublishEnabled(): boolean {
  return process.env.FINANCE_AUTOPUBLISH_ENABLED === "true";
}
