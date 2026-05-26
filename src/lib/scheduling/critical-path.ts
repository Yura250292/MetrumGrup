/**
 * Public contract для CPM. Реалізація — у `src/lib/tasks/dependencies.ts`
 * (computeCriticalPath). Тут лише re-export + офіційні types для зовнішніх
 * модулів (Gantt UI, API, exports).
 */
export {
  computeCriticalPath,
  type CpmNode,
} from "../tasks/dependencies";

/** Тип ребра для CPM (FS / SS / FF / SF з lagDays). */
export type CpmDependencyType = "FS" | "SS" | "FF" | "SF";

export type CpmEdge = {
  predecessorId: string;
  successorId: string;
  type: CpmDependencyType;
  lagDays: number;
};
