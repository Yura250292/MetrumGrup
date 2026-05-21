import type { BotSessionScope, Role } from '@prisma/client';
import { RbacError } from './errors';
import { findTool } from './tools/registry';

/**
 * Runtime-level RBAC: повторна перевірка перед викликом handler.
 * Захищає від prompt-injection що спромогається попросити Gemini викликати
 * tool якого нема у списку (registry filter).
 */
export function assertToolAllowed(
  toolName: string,
  role: Role | null,
  scope: BotSessionScope,
): void {
  const tool = findTool(toolName);
  if (!tool) throw new RbacError(toolName);
  if (!role) throw new RbacError(toolName);
  if (!tool.allowedRoles.includes(role)) throw new RbacError(toolName);
  if (tool.scopes && !tool.scopes.includes(scope)) throw new RbacError(toolName);
}
