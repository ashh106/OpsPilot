import {
  AgentMessage,
  AgentResponse,
  AiProvider,
  GenerationOptions,
  ToolCall,
  ToolDefinition,
} from "./provider.js";

export class MockAiProvider implements AiProvider {
  public readonly name = "mock";
  private responseQueue: AgentResponse[] = [];
  public callHistory: Array<{
    messages: AgentMessage[];
    tools: ToolDefinition[];
    options?: GenerationOptions;
  }> = [];

  /**
   * Queue a pre-determined response for test predictability.
   */
  queueResponse(response: AgentResponse): void {
    this.responseQueue.push(response);
  }

  /**
   * Queue multiple pre-determined responses.
   */
  queueResponses(responses: AgentResponse[]): void {
    this.responseQueue.push(...responses);
  }

  /**
   * Reset the response queue and call history.
   */
  reset(): void {
    this.responseQueue = [];
    this.callHistory = [];
  }

  async generateResponse(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    options?: GenerationOptions,
  ): Promise<AgentResponse> {
    this.callHistory.push({ messages, tools, options });

    // 1. Scripted Queue Mode
    if (this.responseQueue.length > 0) {
      return this.responseQueue.shift()!;
    }

    // 2. Heuristic / Rule-based Simulation
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) {
      return {
        content: "Hello! How can I assist you with your appointment today?",
        finishReason: "stop",
      };
    }

    // If the last message was a tool result, formulate a natural confirmation
    if (lastMessage.role === "tool") {
      try {
        const toolResult = JSON.parse(lastMessage.content);
        if (toolResult.success) {
          if (toolResult.data?.slots) {
            const count = toolResult.data.slots.length;
            return {
              content: `We have ${count} available slots on that date. Would you like to book one?`,
              finishReason: "stop",
            };
          }
          if (toolResult.data?.appointmentId) {
            return {
              content: `Great! Your appointment has been booked. Reference ID: ${toolResult.data.appointmentId}.`,
              finishReason: "stop",
            };
          }
          if (toolResult.data?.message) {
            return {
              content: `${toolResult.data.message}`,
              finishReason: "stop",
            };
          }
        } else {
          return {
            content: `I couldn't complete that request: ${toolResult.error?.message || "An error occurred"}. Would you like to try another time?`,
            finishReason: "stop",
          };
        }
      } catch {
        return {
          content: "I have processed your request. Is there anything else I can help with?",
          finishReason: "stop",
        };
      }
    }

    const text = (lastMessage.content || "").toLowerCase();

    // Check for availability requests
    if (text.includes("available") || text.includes("slot") || text.includes("timing") || text.includes("open")) {
      const toolCall: ToolCall = {
        id: `call_${Date.now()}_avail`,
        name: "check_availability",
        arguments: {
          serviceId: "General Consultation",
          startDate: "2026-11-02",
        },
      };
      return {
        content: "Checking available appointment slots for you...",
        toolCalls: [toolCall],
        finishReason: "tool_calls",
      };
    }

    // Check for booking requests
    if (text.includes("book") || text.includes("schedule") || text.includes("reserve")) {
      const toolCall: ToolCall = {
        id: `call_${Date.now()}_book`,
        name: "book_appointment",
        arguments: {
          serviceId: "General Consultation",
          startTime: "2026-11-02T10:00:00.000Z",
          customerName: "Jane Doe",
          customerPhone: "+919876543210",
        },
      };
      return {
        content: "I am reserving your appointment now...",
        toolCalls: [toolCall],
        finishReason: "tool_calls",
      };
    }

    // Check for business info
    if (text.includes("hours") || text.includes("info") || text.includes("services") || text.includes("price")) {
      const toolCall: ToolCall = {
        id: `call_${Date.now()}_info`,
        name: "get_business_information",
        arguments: {
          includeServices: true,
        },
      };
      return {
        content: "Looking up our clinic information for you...",
        toolCalls: [toolCall],
        finishReason: "tool_calls",
      };
    }

    // Default conversational response
    return {
      content: "Hello! I am Dr. Robin's Clinic Assistant. I can help you check available appointment slots, book an appointment, or reschedule. How can I help you today?",
      finishReason: "stop",
    };
  }
}
