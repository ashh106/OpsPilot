import { ToolDefinition } from "../agents/provider.js";

export interface ToolContext {
  businessId: string;
  conversationId: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  idempotencyKey?: string;
  actorRole?: string;
  isSellerAuthorized?: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AgentTool<TInput = Record<string, unknown>> {
  definition: ToolDefinition;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}
