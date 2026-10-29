import { AudioTranscriptionProvider, TranscriptionResult } from "./types.js";

export class MockTranscriptionProvider implements AudioTranscriptionProvider {
  name = "mock";
  private customResponses = new Map<string, TranscriptionResult>();

  setResponseForMime(mimeType: string, result: TranscriptionResult): void {
    this.customResponses.set(mimeType, result);
  }

  async transcribe(params: {
    audioBuffer: Buffer;
    mimeType: string;
    languageHint?: string;
  }): Promise<TranscriptionResult> {
    if (params.audioBuffer.length === 0) {
      throw new Error("Cannot transcribe empty audio buffer");
    }

    if (this.customResponses.has(params.mimeType)) {
      return this.customResponses.get(params.mimeType)!;
    }

    // Default mock response depending on language hint
    const lang = params.languageHint || "en";
    if (lang === "hi") {
      return {
        text: "10 किलो आलू जोड़ो",
        detectedLanguage: "hi",
        confidence: 0.95,
      };
    } else if (lang === "mr") {
      return {
        text: "10 किलो बटाटे जोडा",
        detectedLanguage: "mr",
        confidence: 0.94,
      };
    }

    return {
      text: "Add 10 kg potatoes",
      detectedLanguage: "en",
      confidence: 0.98,
    };
  }
}

export const defaultMockTranscriptionProvider = new MockTranscriptionProvider();
