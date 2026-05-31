/// Phase 1 trigger для Estimate → Task auto-sync.
///
/// Коли OFF (за замовч.): existing sync-to-stages працює як раніше, нові
/// поля planning (`plannedStart` / `plannedDurationDays` / `predecessorItemId`)
/// зберігаються у схемі але НЕ матеріалізуються у Task / TaskDependency.
///
/// Коли ON: після кожного `syncEstimateToStages` автоматично запускається
/// `syncEstimateItemsToTasks`, генеруючи Task на кожен labor/composite/equipment
/// item і TaskDependency згідно з predecessor-полями.
///
/// Контролюється тільки через env, без runtime-toggle (детерміновано для тестів).
export function isEstimateToTasksSyncEnabled(): boolean {
  return process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED === "true";
}
