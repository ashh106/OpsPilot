import { env } from "../../config/env.js";

export interface WhatsAppSendResult {
  messagingProduct: string;
  contactWaId: string;
  messageId: string; // WhatsApp provider message ID (wamid)
}

export interface WhatsAppClientOptions {
  accessToken?: string;
  phoneNumberId?: string;
  apiVersion?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly code: "AUTH_FAILED" | "RATE_LIMITED" | "BAD_REQUEST" | "TIMEOUT" | "NETWORK_ERROR" | "UNKNOWN",
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

export class WhatsAppClient {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: WhatsAppClientOptions = {}) {
    this.accessToken = options.accessToken ?? env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = options.phoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID;
    this.apiVersion = options.apiVersion ?? env.WHATSAPP_GRAPH_API_VERSION;
    this.baseUrl = (options.baseUrl ?? "https://graph.facebook.com").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  /**
   * Constructs the full Graph API endpoint for messages.
   * Format: https://graph.facebook.com/{apiVersion}/{phoneNumberId}/messages
   */
  public getMessagesEndpoint(): string {
    return `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Sends a standard individual text message to a WhatsApp user.
   */
  async sendTextMessage(to: string, text: string): Promise<WhatsAppSendResult> {
    const endpoint = this.getMessagesEndpoint();

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    };

    return this.postRequest(endpoint, payload);
  }

  /**
   * Sends an approved template message (used outside the 24-hour service window).
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = "en",
    components: unknown[] = [],
  ): Promise<WhatsAppSendResult> {
    const endpoint = this.getMessagesEndpoint();

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components.length > 0 ? components : undefined,
      },
    };

    return this.postRequest(endpoint, payload);
  }

  /**
   * Sends an interactive button message (up to 3 buttons) supported by Meta WhatsApp Cloud API.
   */
  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<WhatsAppSendResult> {
    const endpoint = this.getMessagesEndpoint();

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((btn) => ({
            type: "reply",
            reply: {
              id: btn.id,
              title: btn.title.slice(0, 20),
            },
          })),
        },
      },
    };

    return this.postRequest(endpoint, payload);
  }

  /**
   * Sends an interactive list message (up to 10 rows per section) supported by Meta WhatsApp Cloud API.
   */
  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<WhatsAppSendResult> {
    const endpoint = this.getMessagesEndpoint();

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonText.slice(0, 20),
          sections: sections.map((sec) => ({
            title: sec.title.slice(0, 24),
            rows: sec.rows.slice(0, 10).map((r) => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              description: r.description ? r.description.slice(0, 72) : undefined,
            })),
          })),
        },
      },
    };

    return this.postRequest(endpoint, payload);
  }

  /**
   * Fetches media binary from Meta Graph API using the media ID.
   * Step 1: Resolves media URL metadata from GET /{media_id}
   * Step 2: Downloads binary data from the resolved download URL
   */
  async fetchMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string; fileSize?: number }> {
    const metadataUrl = `${this.baseUrl}/${this.apiVersion}/${mediaId}`;

    const metaResponse = await this.fetchFn(metadataUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!metaResponse.ok) {
      throw new WhatsAppApiError(
        `Failed to resolve media metadata for ${mediaId}`,
        "BAD_REQUEST",
        metaResponse.status,
      );
    }

    const metaData = (await metaResponse.json()) as {
      url: string;
      mime_type: string;
      file_size?: number;
    };

    if (!metaData.url) {
      throw new WhatsAppApiError("Media metadata did not include download URL", "BAD_REQUEST");
    }

    const mediaResponse = await this.fetchFn(metaData.url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!mediaResponse.ok) {
      throw new WhatsAppApiError(
        `Failed to download media bytes for ${mediaId}`,
        "NETWORK_ERROR",
        mediaResponse.status,
      );
    }

    const arrayBuffer = await mediaResponse.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: metaData.mime_type,
      fileSize: metaData.file_size,
    };
  }

  private async postRequest(endpoint: string, payload: unknown): Promise<WhatsAppSendResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }

        let code: "AUTH_FAILED" | "RATE_LIMITED" | "BAD_REQUEST" | "UNKNOWN" = "UNKNOWN";
        if (response.status === 401 || response.status === 403) {
          code = "AUTH_FAILED";
        } else if (response.status === 429) {
          code = "RATE_LIMITED";
        } else if (response.status === 400) {
          code = "BAD_REQUEST";
        }

        throw new WhatsAppApiError(
          `Meta Graph API returned HTTP ${response.status}`,
          code,
          response.status,
          errorData,
        );
      }

      const data = (await response.json()) as {
        messaging_product: string;
        contacts?: Array<{ input: string; wa_id: string }>;
        messages?: Array<{ id: string }>;
      };

      const messageId = data.messages?.[0]?.id;
      const contactWaId = data.contacts?.[0]?.wa_id || "";

      if (!messageId) {
        throw new WhatsAppApiError(
          "Meta Graph API response missing message ID",
          "BAD_REQUEST",
          response.status,
          data,
        );
      }

      return {
        messagingProduct: data.messaging_product,
        contactWaId,
        messageId,
      };
    } catch (err: unknown) {
      if (err instanceof WhatsAppApiError) {
        throw err;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new WhatsAppApiError(
          `Meta Graph API request timed out after ${this.timeoutMs}ms`,
          "TIMEOUT",
        );
      }
      const message = err instanceof Error ? err.message : "Network error contacting Meta Graph API";
      throw new WhatsAppApiError(message, "NETWORK_ERROR", undefined, err);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const defaultWhatsAppClient = new WhatsAppClient();
