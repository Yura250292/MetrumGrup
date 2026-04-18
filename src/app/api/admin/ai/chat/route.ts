import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/ai-assistant/system-prompts";
import { getToolsForRole } from "@/lib/ai-assistant/tools";
import { executeTool } from "@/lib/ai-assistant/tool-executors";
import type { AiUserContext, AiToolName, ToolCallRecord } from "@/lib/ai-assistant/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 8;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY не налаштований" }), { status: 500 });
  }

  const body = await request.json();
  const { conversationId: existingConvId, message, projectId } = body as {
    conversationId?: string;
    message: string;
    projectId?: string;
  };

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Повідомлення не може бути порожнім" }), { status: 400 });
  }

  const userCtx: AiUserContext = {
    userId: session.user.id,
    userName: session.user.name ?? "Користувач",
    role: session.user.role,
  };

  // Create or load conversation
  let conversationId = existingConvId;
  if (conversationId) {
    const existing = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId: userCtx.userId },
    });
    if (!existing) {
      return new Response(JSON.stringify({ error: "Розмову не знайдено" }), { status: 404 });
    }
  } else {
    const conv = await prisma.aiConversation.create({
      data: { userId: userCtx.userId, title: message.slice(0, 100) },
    });
    conversationId = conv.id;
  }

  // Save user message
  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: "USER",
      content: message,
    },
  });

  // Load history
  const history = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY * 2,
    select: { role: true, content: true },
  });

  const systemPrompt = buildSystemPrompt(userCtx);
  const tools = getToolsForRole(userCtx.role);

  // Build messages for Anthropic
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  // Add project context hint if projectId provided
  if (projectId && !message.toLowerCase().includes(projectId)) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "user" && typeof lastMsg.content === "string") {
      lastMsg.content = `[Контекст: користувач знаходиться на сторінці проєкту ${projectId}]\n\n${lastMsg.content}`;
    }
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        let fullResponse = "";
        const toolCallRecords: ToolCallRecord[] = [];
        let currentMessages = [...messages];
        let tokenUsage = { inputTokens: 0, outputTokens: 0 };

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            tools,
            messages: currentMessages,
          });

          tokenUsage.inputTokens += response.usage.input_tokens;
          tokenUsage.outputTokens += response.usage.output_tokens;

          let hasToolUse = false;
          const toolResults: Anthropic.MessageParam[] = [];

          for (const block of response.content) {
            if (block.type === "text") {
              fullResponse += block.text;
              sendEvent("text", block.text);
            } else if (block.type === "tool_use") {
              hasToolUse = true;
              sendEvent("tool_use", { toolName: block.name });

              const result = await executeTool(
                block.name as AiToolName,
                block.input as Record<string, unknown>,
                userCtx,
              );

              toolCallRecords.push({
                toolName: block.name,
                input: block.input as Record<string, unknown>,
                result: JSON.parse(result).error ? { error: JSON.parse(result).error } : "OK",
              });

              // Build tool_result for next round
              if (toolResults.length === 0) {
                // Push the assistant message with tool_use blocks first
                currentMessages.push({
                  role: "assistant",
                  content: response.content,
                });
              }

              toolResults.push({
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: result,
                  },
                ],
              } as Anthropic.MessageParam);
            }
          }

          if (!hasToolUse) {
            // No more tool calls — done
            break;
          }

          // Add tool results for next round
          // Combine all tool results into single user message
          const allToolResults = toolResults.flatMap((tr) =>
            Array.isArray(tr.content) ? tr.content : [],
          );
          currentMessages.push({
            role: "user",
            content: allToolResults,
          } as Anthropic.MessageParam);
        }

        // Save assistant message
        await prisma.aiMessage.create({
          data: {
            conversationId: conversationId!,
            role: "ASSISTANT",
            content: fullResponse,
            toolCalls: toolCallRecords.length > 0 ? JSON.parse(JSON.stringify(toolCallRecords)) : undefined,
            tokenUsage,
          },
        });

        sendEvent("done", { conversationId, tokenUsage });
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Внутрішня помилка";
        sendEvent("error", { message: msg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
