/**
 * Cycle detection поверх існуючих TaskDependency. Викликається у POST
 * /api/admin/tasks/[id]/dependencies перед insert.
 *
 * Реалізація лежить у `addDependency` (src/lib/tasks/dependencies.ts) як
 * private DFS — тут публічно експонована функція-обгортка.
 */
import { prisma } from "../prisma";

export type CyclePath = string[];

/**
 * Перевіряє, чи додавання ребра predecessor → successor створить цикл у
 * графі залежностей. Якщо так — повертає шлях (включно з замикаючим
 * вузлом). null = циклу немає.
 *
 * Алгоритм: DFS з `successor`. Якщо досягаємо `predecessor` — цикл.
 */
export async function detectCycle(
  predecessorId: string,
  successorId: string,
): Promise<CyclePath | null> {
  if (predecessorId === successorId) {
    return [predecessorId, predecessorId];
  }

  // Підвантажуємо ребра тільки для цього проєкту — для швидкого BFS.
  const succ = await prisma.task.findUnique({
    where: { id: successorId },
    select: { projectId: true },
  });
  if (!succ) return null;

  const edges = await prisma.taskDependency.findMany({
    where: { predecessor: { projectId: succ.projectId } },
    select: { predecessorId: true, successorId: true },
  });

  // adj: predecessor → [successors]
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.predecessorId) ?? [];
    arr.push(e.successorId);
    adj.set(e.predecessorId, arr);
  }

  // Уявно додаємо нове ребро predecessor → successor, потім DFS з successor.
  // Якщо досягнемо predecessor — є цикл.
  const stack: { node: string; path: string[] }[] = [
    { node: successorId, path: [predecessorId, successorId] },
  ];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) break;
    if (visited.has(top.node)) continue;
    visited.add(top.node);
    const next = adj.get(top.node) ?? [];
    for (const n of next) {
      if (n === predecessorId) {
        return [...top.path, n];
      }
      stack.push({ node: n, path: [...top.path, n] });
    }
  }
  return null;
}
