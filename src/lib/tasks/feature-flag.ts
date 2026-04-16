import { prisma } from "@/lib/prisma";

/**
 * Feature flag for the task/PM layer.
 * Stored in the `Setting` table under id = "features.tasks".
 * Value shape: { enabled: boolean, projectIds?: string[] }
 *
 *   { enabled: false }                     → fully off (default)
 *   { enabled: true }                      → fully on (all projects)
 *   { enabled: false, projectIds: [...] }  → per-project opt-in
 *
 * Callers use `isTasksEnabledForProject(projectId)` before showing task UI
 * or processing task-related API calls. This allows a dark-launch: existing
 * functionality works unchanged while we progressively enable tasks.
 */

const SETTING_ID = "features.tasks";

type FlagValue = {
  enabled?: boolean;
  projectIds?: string[];
};

async function readFlag(): Promise<FlagValue> {
  const row = await prisma.setting.findUnique({ where: { id: SETTING_ID } });
  if (!row || typeof row.value !== "object" || row.value === null) {
    return { enabled: false };
  }
  return row.value as FlagValue;
}

export async function isTasksEnabledGlobally(): Promise<boolean> {
  const flag = await readFlag();
  return Boolean(flag.enabled);
}

export async function isTasksEnabledForProject(projectId: string): Promise<boolean> {
  const flag = await readFlag();
  if (flag.enabled) return true;
  if (flag.projectIds?.includes(projectId)) return true;
  return false;
}

export async function enableTasksGlobally(): Promise<void> {
  await prisma.setting.upsert({
    where: { id: SETTING_ID },
    update: { value: { enabled: true } },
    create: { id: SETTING_ID, value: { enabled: true } },
  });
}

export async function enableTasksForProject(projectId: string): Promise<void> {
  const current = await readFlag();
  const next: FlagValue = {
    enabled: current.enabled ?? false,
    projectIds: Array.from(new Set([...(current.projectIds ?? []), projectId])),
  };
  await prisma.setting.upsert({
    where: { id: SETTING_ID },
    update: { value: next },
    create: { id: SETTING_ID, value: next },
  });
}

export async function disableTasks(): Promise<void> {
  await prisma.setting.upsert({
    where: { id: SETTING_ID },
    update: { value: { enabled: false } },
    create: { id: SETTING_ID, value: { enabled: false } },
  });
}
