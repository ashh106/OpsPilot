export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AgentResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: "stop" | "tool_calls" | "length" | "error";
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "TIMEOUT" | "RATE_LIMIT" | "PROVIDER_DOWN" | "MALFORMED_RESPONSE" | "UNKNOWN" = "UNKNOWN",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiProvider {
  readonly name: string;
  generateResponse(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    options?: GenerationOptions,
  ): Promise<AgentResponse>;
}
