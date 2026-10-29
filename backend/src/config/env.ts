import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["ollama", "mock"]).default("ollama"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("llama3.1"),

  // Meta WhatsApp Business Cloud API Configuration
  WHATSAPP_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/, "WHATSAPP_GRAPH_API_VERSION must be in format vXX.X (e.g. v26.0)")
    .default("v26.0"),
  WHATSAPP_ACCESS_TOKEN: z.string().default("mock_whatsapp_access_token"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default("mock_phone_number_id"),
  WHATSAPP_WABA_ID: z.string().default("mock_waba_id"),
  WHATSAPP_VERIFY_TOKEN: z.string().default("mock_verify_token"),
  WHATSAPP_APP_SECRET: z.string().default("mock_app_secret_1234567890abcdef"),
  WHATSAPP_BUSINESS_ID: z.string().uuid().optional(),

  // Dedicated Platform Administration Key
  ADMIN_API_KEY: z.string().default("opspilot-admin-secret-key-change-in-production"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
