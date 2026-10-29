import {
  AgentMessage,
  AgentResponse,
  AiProvider,
  AiProviderError,
  GenerationOptions,
  ToolCall,
  ToolDefinition,
} from "./provider.js";

interface OllamaToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: "assistant";
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements AiProvider {
  public readonly name = "ollama";

  constructor(
    private readonly baseUrl: string = "http://localhost:11434",
    private readonly model: string = "llama3.1",
  ) {}

  async generateResponse(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    options?: GenerationOptions,
  ): Promise<AgentResponse> {
    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/api/chat`;
    const timeoutMs = options?.timeoutMs ?? 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Format tools for Ollama function calling specification
    const ollamaTools = tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    // Format messages for Ollama API
    const ollamaMessages: OllamaMessage[] = messages.map((m) => {
      const msg: OllamaMessage = {
        role: m.role,
        content: m.content || "",
      };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }
      return msg;
    });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: ollamaMessages,
          tools: ollamaTools.length > 0 ? ollamaTools : undefined,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.2,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AiProviderError(
          `Ollama returned HTTP ${response.status}: ${errorText}`,
          response.status === 429 ? "RATE_LIMIT" : "PROVIDER_DOWN",
          { status: response.status, body: errorText },
        );
      }

      const data = (await response.json()) as OllamaChatResponse;

      const toolCalls: ToolCall[] = [];
      if (data.message.tool_calls && Array.isArray(data.message.tool_calls)) {
        for (const tc of data.message.tool_calls) {
          let args: Record<string, unknown> = {};
          if (typeof tc.function.arguments === "string") {
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = {};
            }
          } else if (typeof tc.function.arguments === "object" && tc.function.arguments !== null) {
            args = tc.function.arguments;
          }

          toolCalls.push({
            id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
            name: tc.function.name,
            arguments: args,
          });
        }
      }

      return {
        content: data.message.content || "",
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
        usage: {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
        },
      };
    } catch (err: unknown) {
      if (err instanceof AiProviderError) {
        throw err;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new AiProviderError(
          `Ollama request timed out after ${timeoutMs}ms`,
          "TIMEOUT",
        );
      }
      const message = err instanceof Error ? err.message : "Unknown Ollama communication error";
      throw new AiProviderError(
        `Failed to communicate with Ollama at ${endpoint}: ${message}`,
        "PROVIDER_DOWN",
        err,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
