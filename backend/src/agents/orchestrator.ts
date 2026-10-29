import { MessageRole, Prisma, ToolStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/errors.js";
import { getZonedParts } from "../utils/timezone.js";
import {
  AgentMessage,
  AiProvider,
} from "./provider.js";
import { getAiProvider } from "./factory.js";
import { defaultToolRegistry, ToolRegistry } from "../tools/registry.js";
import { buildSystemPrompt, BusinessPromptContext } from "./prompts/booking-agent.js";
import { ToolContext } from "../tools/types.js";

export interface AgentExecutionOptions {
  businessId: string;
  conversationId: string;
  customerMessage: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  idempotencyKey?: string;
  isSellerAuthorized?: boolean;
  provider?: AiProvider;
  toolRegistry?: ToolRegistry;
  maxIterations?: number;
  persist?: boolean;
}

export interface AgentExecutionResult {
  reply: string;
  toolExecutions: Array<{
    toolName: string;
    input: Record<string, unknown>;
    result: unknown;
    status: "SUCCESS" | "ERROR";
  }>;
  messages: AgentMessage[];
  assistantMessageId?: string;
}

export class AgentOrchestrator {
  /**
   * Runs the bounded agent loop with validated tool execution and conversation persistence.
   */
  static async processMessage(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const {
      businessId,
      conversationId,
      customerMessage,
      customerId,
      customerPhone,
      customerName,
      idempotencyKey,
      provider = getAiProvider(),
      toolRegistry = defaultToolRegistry,
      maxIterations = 5,
      persist = true,
    } = options;

    // 1. Fetch business and active services for the system prompt
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        services: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            price: true,
            currency: true,
          },
        },
        products: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            stockQuantity: true,
            unit: true,
            sku: true,
          },
          take: 30,
        },
      },
    });

    if (!business) {
      throw AppError.notFound(`Business with ID ${businessId} not found`);
    }

    // 2. Build business prompt context in the business timezone
    const now = new Date();
    const parts = getZonedParts(now, business.timezone);
    const currentDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    const currentTime = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;

    const promptContext: BusinessPromptContext = {
      businessName: business.name,
      category: business.category,
      timezone: business.timezone,
      currentDate,
      currentTime,
      cancellationNoticeHours: business.cancellationNoticeHours,
      services: business.services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: Number(s.price),
        currency: s.currency,
      })),
      products: business.products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        currency: p.currency,
        stockQuantity: p.stockQuantity,
        unit: p.unit,
        sku: p.sku,
      })),
    };

    const systemPrompt = buildSystemPrompt(promptContext);

    // 3. Setup conversation and history
    const historyMessages: AgentMessage[] = [];

    if (persist) {
      // Ensure conversation exists
      const existingConv = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!existingConv) {
        await prisma.conversation.create({
          data: {
            id: conversationId,
            businessId,
            customerId: customerId ?? null,
            tokenHash: "system-orchestrator",
          },
        });
      }

      // Record inbound customer message
      await prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.USER,
          content: customerMessage,
        },
      });

      // Fetch recent message history (last 10)
      const dbHistory = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: 10,
      });

      for (const m of dbHistory) {
        let role: "user" | "assistant" | "system" | "tool" = "user";
        if (m.role === MessageRole.ASSISTANT) role = "assistant";
        else if (m.role === MessageRole.TOOL) role = "tool";

        historyMessages.push({
          role,
          content: m.content,
        });
      }
    } else {
      historyMessages.push({
        role: "user",
        content: customerMessage,
      });
    }

    const currentMessages: AgentMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
    ];

    const toolContext: ToolContext = {
      businessId,
      conversationId,
      customerId,
      customerPhone,
      customerName,
      idempotencyKey,
      isSellerAuthorized: options.isSellerAuthorized,
    };

    const executedTools: Array<{
      toolName: string;
      input: Record<string, unknown>;
      result: unknown;
      status: "SUCCESS" | "ERROR";
    }> = [];

    let finalReply = "";

    // 4. Bounded Agent Execution Loop
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const response = await provider.generateResponse(
        currentMessages,
        toolRegistry.getDefinitions(),
      );

      if (response.toolCalls && response.toolCalls.length > 0) {
        currentMessages.push({
          role: "assistant",
          content: response.content || "",
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const toolResult = await toolRegistry.execute(
            toolCall.name,
            toolCall.arguments,
            toolContext,
          );

          const status = toolResult.success ? ToolStatus.SUCCESS : ToolStatus.ERROR;

          if (persist) {
            await prisma.toolExecution.create({
              data: {
                businessId,
                conversationId,
                toolName: toolCall.name,
                input: toolCall.arguments as Prisma.InputJsonValue,
                result: toolResult as unknown as Prisma.InputJsonValue,
                status,
              },
            });
          }

          executedTools.push({
            toolName: toolCall.name,
            input: toolCall.arguments,
            result: toolResult,
            status: toolResult.success ? "SUCCESS" : "ERROR",
          });

          currentMessages.push({
            role: "tool",
            content: JSON.stringify(toolResult),
            toolCallId: toolCall.id,
          });
        }
      } else {
        finalReply = response.content;
        break;
      }
    }

    if (!finalReply) {
      finalReply =
        "I'm sorry, I encountered an issue processing your appointment request. Please contact our front desk directly.";
    }

    let assistantMsgId: string | undefined;

    if (persist) {
      const createdAssistantMsg = await prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: finalReply,
        },
      });
      assistantMsgId = createdAssistantMsg.id;

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    }

    return {
      reply: finalReply,
      toolExecutions: executedTools,
      messages: currentMessages,
      assistantMessageId: assistantMsgId,
    };
  }
}
