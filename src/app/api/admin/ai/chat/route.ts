import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/ai-assistant/system-prompts";
import { getToolsForRole } from "@/lib/ai-assistant/tools";
import { executeTool } from "@/lib/ai-assistant/tool-executors";
import type { AiUserContext, AiToolName, ToolCallRecord } from "@/lib/ai-assistant/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 8;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY не налаштований" }), { status: 500 });
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

  // Build messages for OpenAI
  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m): OpenAI.ChatCompletionMessageParam => ({
      role: m.role === "USER" ? "user" : "assistant",
      content: m.content,
    })),
  ];

  // Add project context hint if projectId provided
  if (projectId) {
    const lastMsg = chatMessages[chatMessages.length - 1];
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
        let currentMessages = [...chatMessages];
        let totalTokens = { inputTokens: 0, outputTokens: 0 };

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 4096,
            temperature: 0.3,
            messages: currentMessages,
            tools,
            tool_choice: "auto",
          });

          const choice = response.choices[0];
          if (!choice) break;

          totalTokens.inputTokens += response.usage?.prompt_tokens ?? 0;
          totalTokens.outputTokens += response.usage?.completion_tokens ?? 0;

          const msg = choice.message;

          // Handle text content
          if (msg.content) {
            fullResponse += msg.content;
            sendEvent("text", msg.content);
          }

          // Handle tool calls
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            // Add assistant message with tool calls to history
            currentMessages.push(msg as OpenAI.ChatCompletionMessageParam);

            for (const toolCall of msg.tool_calls) {
              if (toolCall.type !== "function") continue;
              const fnName = toolCall.function.name;
              let fnArgs: Record<string, unknown> = {};
              try {
                fnArgs = JSON.parse(toolCall.function.arguments || "{}");
              } catch {
                fnArgs = {};
              }

              sendEvent("tool_use", { toolName: fnName });

              const result = await executeTool(
                fnName as AiToolName,
                fnArgs,
                userCtx,
              );

              toolCallRecords.push({
                toolName: fnName,
                input: fnArgs,
                result: (() => {
                  try {
                    const parsed = JSON.parse(result);
                    return parsed.error ? { error: parsed.error } : "OK";
                  } catch {
                    return "OK";
                  }
                })(),
              });

              // Add tool result to messages
              currentMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
              } as OpenAI.ChatCompletionMessageParam);
            }

            // Continue loop — model needs to process tool results
            continue;
          }

          // No tool calls and we have content — done
          break;
        }

        // Save assistant message
        await prisma.aiMessage.create({
          data: {
            conversationId: conversationId!,
            role: "ASSISTANT",
            content: fullResponse,
            toolCalls: toolCallRecords.length > 0 ? JSON.parse(JSON.stringify(toolCallRecords)) : undefined,
            tokenUsage: totalTokens,
          },
        });

        sendEvent("done", { conversationId, tokenUsage: totalTokens });
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
