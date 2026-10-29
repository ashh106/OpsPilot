export interface TranscriptionResult {
  text: string;
  detectedLanguage?: string;
  confidence?: number;
}

export interface AudioTranscriptionProvider {
  name: string;
  transcribe(params: {
    audioBuffer: Buffer;
    mimeType: string;
    languageHint?: string;
  }): Promise<TranscriptionResult>;
}

export interface AudioMediaValidationResult {
  valid: boolean;
  error?: string;
}

export const MAX_AUDIO_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB

export const SUPPORTED_AUDIO_MIMES = [
  "audio/ogg",
  "audio/ogg; codecs=opus",
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
  "audio/amr",
];
