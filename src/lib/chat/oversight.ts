import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SETTING_KEY = "chat_oversight";

export type ChatOversightConfig = {
  roles: Role[];
  userIds: string[];
};

const EMPTY: ChatOversightConfig = { roles: [], userIds: [] };
const VALID_ROLES = new Set<string>(Object.values(Role));

function sanitize(value: unknown): ChatOversightConfig {
  if (!value || typeof value !== "object") return EMPTY;
  const v = value as Partial<ChatOversightConfig>;
  return {
    roles: Array.isArray(v.roles)
      ? (v.roles.filter((r) => typeof r === "string" && VALID_ROLES.has(r)) as Role[])
      : [],
    userIds: Array.isArray(v.userIds)
      ? v.userIds.filter((u) => typeof u === "string")
      : [],
  };
}

export async function getOversightConfig(): Promise<ChatOversightConfig> {
  const row = await prisma.setting.findUnique({ where: { id: SETTING_KEY } });
  return sanitize(row?.value);
}

export async function setOversightConfig(input: ChatOversightConfig): Promise<ChatOversightConfig> {
  const clean = sanitize(input);
  await prisma.setting.upsert({
    where: { id: SETTING_KEY },
    create: { id: SETTING_KEY, value: clean },
    update: { value: clean },
  });
  return clean;
}

export async function canSeeAllChats(userId: string, userRole?: string): Promise<boolean> {
  const config = await getOversightConfig();
  if (config.userIds.includes(userId)) return true;
  if (config.roles.length === 0) return false;
  if (userRole) return config.roles.includes(userRole as Role);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user ? config.roles.includes(user.role) : false;
}
