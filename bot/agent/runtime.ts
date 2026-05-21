import {
  GoogleGenerativeAI,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerativeModel,
  type Part,
  SchemaType,
} from '@google/generative-ai';
import { BotChatRole, type Role } from '@prisma/client';
import type { BotContext } from '../types';
import { prisma } from '../../src/lib/prisma';
import { resolveFirmScope } from '../../src/lib/firm/scope';
import { loadOrCreateSession, type LoadedSession } from './session';
import { consumeFinancierMutation, consumeGlobal } from './rate-limit';
import { assertToolAllowed } from './rbac';
import { getToolsForRole, findTool, type ToolCtx } from './tools/registry';
import { composeSystemPrompt } from './prompts/compose';
import { StreamingEditor } from './streaming';
import {
  BOT_AI_FALLBACK_CHAIN,
  BOT_AI_MODEL,
  MAX_TOOL_CALLS_PER_TURN,
} from './models';
import { AgentError, ModelUnavailableError, RateLimitError } from './errors';

// Side-effect imports to populate registry.
import './tools/common';
import './tools/foreman';
import './tools/manager';
import './tools/engineer';

export type AgentInput = {
  text?: string;
  /** Extra context to inject as a user-message prefix (e.g. OCR result). */
  prefix?: string;
};

function toGeminiTools(role: Role | null, scope: LoadedSession['scope']) {
  const tools = getToolsForRole(role, scope);
  if (tools.length === 0) return undefined;
  const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as unknown as FunctionDeclaration['parameters'],
  }));
  return [{ functionDeclarations }];
}

function buildHistoryContent(loaded: LoadedSession): Content[] {
  const out: Content[] = [];
  for (const m of loaded.history) {
    if (m.role === BotChatRole.USER) {
      out.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === BotChatRole.ASSISTANT) {
      out.push({ role: 'model', parts: [{ text: m.content }] });
    } else if (m.role === BotChatRole.TOOL && m.toolName) {
      out.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: m.toolName,
              response: (m.toolResult as object) ?? { ok: false },
            },
          },
        ],
      });
    }
  }
  return out;
}

function getGenAI(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new ModelUnavailableError();
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

function makeModel(name: string, systemInstruction: string): GenerativeModel {
  return getGenAI().getGenerativeModel({
    model: name,
    systemInstruction,
  });
}

async function persistMessage(
  sessionId: string,
  role: BotChatRole,
  payload: {
    content?: string;
    toolName?: string;
    toolCallId?: string;
    toolArgs?: unknown;
    toolResult?: unknown;
    tokenUsage?: unknown;
    errored?: boolean;
  },
): Promise<void> {
  await prisma.botChatMessage.create({
    data: {
      sessionId,
      role,
      content: payload.content ?? '',
      toolName: payload.toolName ?? null,
      toolCallId: payload.toolCallId ?? null,
      toolArgs: payload.toolArgs as never,
      toolResult: payload.toolResult as never,
      tokenUsage: payload.tokenUsage as never,
      errored: payload.errored ?? false,
    },
  });
}

const FINANCIER_MUTATION_TOOLS = new Set([
  'approve_finance_entry',
  'reject_finance_entry',
]);

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  loaded: LoadedSession,
  ctx: BotContext,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const tool = findTool(toolName);
  if (!tool || !loaded.user || !loaded.role) {
    return { ok: false, error: 'tool_not_found_or_user_unlinked' };
  }

  assertToolAllowed(toolName, loaded.role, loaded.scope);

  if (loaded.role === 'FINANCIER' && FINANCIER_MUTATION_TOOLS.has(toolName)) {
    consumeFinancierMutation(BigInt(ctx.from!.id));
  }

  const firmScope = resolveFirmScope(
    {
      user: {
        id: loaded.user.id,
        role: loaded.role,
        firmId: loaded.firmId,
      } as never,
    } as never,
  );

  const toolCtx: ToolCtx = {
    user: loaded.user,
    role: loaded.role,
    firmId: loaded.firmId,
    firmScope,
    telegramId: BigInt(ctx.from!.id),
    chatId: BigInt(ctx.chat!.id),
    scope: loaded.scope,
    bot: ctx,
  };

  try {
    const result = await tool.handler(args, toolCtx);
    if (tool.mutation) {
      await prisma.botAuditLog.create({
        data: {
          userId: loaded.user.id,
          telegramId: BigInt(ctx.from!.id),
          action: `tool.${toolName}`,
          payload: args as never,
          resultOk: true,
          firmId: loaded.firmId,
        },
      });
    }
    return { ok: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (tool.mutation) {
      await prisma.botAuditLog.create({
        data: {
          userId: loaded.user.id,
          telegramId: BigInt(ctx.from!.id),
          action: `tool.${toolName}`,
          payload: args as never,
          resultOk: false,
          errorCode: msg.slice(0, 100),
          firmId: loaded.firmId,
        },
      });
    }
    return { ok: false, error: msg };
  }
}

async function streamOnce(
  modelName: string,
  systemInstruction: string,
  history: Content[],
  userParts: Part[],
  tools: ReturnType<typeof toGeminiTools>,
  editor: StreamingEditor | null,
): Promise<{
  text: string;
  functionCalls: FunctionCall[];
}> {
  const model = makeModel(modelName, systemInstruction);
  const chat = model.startChat({ history, tools });
  const result = await chat.sendMessageStream(userParts);
  let text = '';
  for await (const chunk of result.stream) {
    const piece = chunk.text();
    if (piece) {
      text += piece;
      if (editor) await editor.push(text);
    }
  }
  const final = await result.response;
  const calls = final.functionCalls?.() ?? [];
  return { text, functionCalls: calls };
}

async function streamWithFallback(
  systemInstruction: string,
  history: Content[],
  userParts: Part[],
  tools: ReturnType<typeof toGeminiTools>,
  editor: StreamingEditor | null,
) {
  let lastErr: unknown;
  for (const modelName of BOT_AI_FALLBACK_CHAIN) {
    try {
      return await streamOnce(modelName, systemInstruction, history, userParts, tools, editor);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[bot-agent] model ${modelName} failed: ${msg}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new ModelUnavailableError();
}

export async function runAgent(
  ctx: BotContext,
  input: AgentInput,
): Promise<void> {
  if (!ctx.from || !ctx.chat) return;
  const userText = [input.prefix, input.text].filter(Boolean).join('\n\n').trim();
  if (!userText) return;

  try {
    consumeGlobal(BigInt(ctx.from.id));
  } catch (err) {
    if (err instanceof RateLimitError) {
      await ctx.reply(err.userMessage);
      return;
    }
    throw err;
  }

  const loaded = await loadOrCreateSession(ctx);

  if (!loaded.user || !loaded.role) {
    await ctx.reply(
      '🔗 Спочатку прив\'яжіть обліковий запис у Metrum. Згенеруйте посилання в профілі та натисніть /start TOKEN.',
    );
    return;
  }

  await persistMessage(loaded.session.id, BotChatRole.USER, { content: userText });

  const processing = await ctx.reply('⏳ Думаю…');
  const editor = new StreamingEditor(ctx, processing.message_id);

  const systemInstruction = composeSystemPrompt({
    user: loaded.user,
    role: loaded.role,
    firmId: loaded.firmId,
    scope: loaded.scope,
    now: new Date(),
  });

  const tools = toGeminiTools(loaded.role, loaded.scope);
  const history = buildHistoryContent(loaded);
  let currentUserParts: Part[] = [{ text: userText }];

  try {
    let toolCallCount = 0;
    let finalText = '';

    while (toolCallCount <= MAX_TOOL_CALLS_PER_TURN) {
      const { text, functionCalls } = await streamWithFallback(
        systemInstruction,
        history,
        currentUserParts,
        tools,
        editor,
      );

      if (text) finalText = text;

      if (functionCalls.length === 0) {
        await editor.finalize(finalText || '✅');
        if (finalText) {
          await persistMessage(loaded.session.id, BotChatRole.ASSISTANT, {
            content: finalText,
          });
        }
        return;
      }

      if (toolCallCount + functionCalls.length > MAX_TOOL_CALLS_PER_TURN) {
        await editor.finalize(
          (finalText ? finalText + '\n\n' : '') +
            '⚠️ Досягнуто ліміту дій для одного запиту. Уточни питання — і я продовжу.',
        );
        return;
      }

      history.push({
        role: 'model',
        parts: [
          ...(finalText ? [{ text: finalText } as Part] : []),
          ...functionCalls.map((fc) => ({ functionCall: fc }) as Part),
        ],
      });

      const responseParts: Part[] = [];
      for (const call of functionCalls) {
        toolCallCount += 1;
        const args = (call.args as Record<string, unknown>) ?? {};
        const exec = await executeTool(call.name, args, loaded, ctx);
        await persistMessage(loaded.session.id, BotChatRole.TOOL, {
          toolName: call.name,
          toolArgs: args,
          toolResult: exec,
          errored: !exec.ok,
        });
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: exec as unknown as object,
          },
        });
      }

      currentUserParts = responseParts;
      finalText = '';
    }

    await editor.finalize(
      '⚠️ Забагато tool-викликів. Уточни запит, і я повторю.',
    );
  } catch (err) {
    const userMsg =
      err instanceof AgentError
        ? err.userMessage
        : '❌ Сталася помилка при обробці запиту. Спробуйте /menu.';
    try {
      await editor.finalize(userMsg);
    } catch {
      await ctx.reply(userMsg);
    }
    console.error('[bot-agent] runAgent error:', err);
  }
}
