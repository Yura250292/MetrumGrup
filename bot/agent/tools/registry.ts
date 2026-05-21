import type { BotContext } from '../../types';
import type { BotSessionScope, Role, User } from '@prisma/client';
import type { FirmScope } from '../../../src/lib/firm/scope';

export type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  description?: string;
};

export type ToolCtx = {
  /** Linked Metrum user. Tools never receive null — runtime gates unlinked users. */
  user: User;
  role: Role;
  firmId: string | null;
  firmScope: FirmScope;
  telegramId: bigint;
  chatId: bigint;
  scope: BotSessionScope;
  /** Direct access if the tool wants to send progress / inline buttons. */
  bot: BotContext;
};

export type ToolDef<TArgs = Record<string, unknown>, TResult = unknown> = {
  name: string;
  description: string;
  parameters: JsonSchema;
  allowedRoles: Role[];
  /** If set, tool only fires in these chat scopes. */
  scopes?: BotSessionScope[];
  /** If true, mutation tool — runtime writes BotAuditLog. */
  mutation?: boolean;
  handler: (args: TArgs, ctx: ToolCtx) => Promise<TResult>;
};

const REGISTRY: ToolDef[] = [];

export function registerTool<TArgs, TResult>(tool: ToolDef<TArgs, TResult>): void {
  if (REGISTRY.some((t) => t.name === tool.name)) {
    throw new Error(`Duplicate tool registration: ${tool.name}`);
  }
  REGISTRY.push(tool as ToolDef);
}

export function getAllTools(): ToolDef[] {
  return [...REGISTRY];
}

export function getToolsForRole(
  role: Role | null,
  scope: BotSessionScope,
): ToolDef[] {
  if (!role) return [];
  return REGISTRY.filter((t) => {
    if (!t.allowedRoles.includes(role)) return false;
    if (t.scopes && !t.scopes.includes(scope)) return false;
    return true;
  });
}

export function findTool(name: string): ToolDef | null {
  return REGISTRY.find((t) => t.name === name) ?? null;
}
