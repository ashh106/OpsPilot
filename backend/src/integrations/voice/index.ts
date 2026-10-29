import { AudioTranscriptionProvider, TranscriptionResult } from "./types.js";
import { defaultMockTranscriptionProvider } from "./mock-transcription-provider.js";
import { env } from "../../config/env.js";

export * from "./types.js";
export * from "./mock-transcription-provider.js";

/**
 * Fallback provider when no speech-to-text service is configured.
 * Safely fails and alerts the caller without performing any mocked transcription.
 */
export class DisabledTranscriptionProvider implements AudioTranscriptionProvider {
  name = "disabled";

  async transcribe(): Promise<TranscriptionResult> {
    throw new Error(
      "Audio transcription service is not configured. Please provide external speech-to-text API credentials or type your request.",
    );
  }
}

/**
 * Returns the configured audio transcription provider.
 * Enforces production security: Mock provider cannot be accidentally used in production.
 */
export function getTranscriptionProvider(): AudioTranscriptionProvider {
  const isProduction = env.NODE_ENV === "production";

  // In test environment, always use deterministic mock
  if (env.NODE_ENV === "test") {
    return defaultMockTranscriptionProvider;
  }

  // In development, allow mock if explicitly configured or default
  if (!isProduction) {
    return defaultMockTranscriptionProvider;
  }

  // In production, refuse mock provider
  return new DisabledTranscriptionProvider();
}
