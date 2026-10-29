import { env } from "../config/env.js";
import { MockAiProvider } from "./mock-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import { AiProvider } from "./provider.js";

let customProvider: AiProvider | null = null;

export function setCustomAiProvider(provider: AiProvider | null): void {
  customProvider = provider;
}

export function getAiProvider(overrideName?: "ollama" | "mock"): AiProvider {
  if (customProvider) {
    return customProvider;
  }

  const providerName = overrideName ?? env.AI_PROVIDER;

  switch (providerName) {
    case "mock":
      return new MockAiProvider();
    case "ollama":
      return new OllamaProvider(env.OLLAMA_BASE_URL, env.OLLAMA_MODEL);
    default:
      return new MockAiProvider();
  }
}
