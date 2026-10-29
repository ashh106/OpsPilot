export interface WhatsAppProfile {
  name: string;
}

export interface WhatsAppContact {
  profile?: WhatsAppProfile;
  wa_id: string;
}

export interface WhatsAppTextMessage {
  body: string;
}

export interface WhatsAppInboundMessage {
  from: string;
  id: string; // e.g. "wamid.HBgL..."
  timestamp: string;
  type: string; // "text", "audio", "interactive", etc.
  text?: WhatsAppTextMessage;
  audio?: {
    id: string;
    mime_type: string;
  };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
}

export interface WhatsAppStatusEvent {
  id: string; // message id (wamid)
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    expiration_timestamp?: string;
    origin?: { type: string };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: { details: string };
  }>;
}

export interface WhatsAppChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppInboundMessage[];
  statuses?: WhatsAppStatusEvent[];
}

export interface WhatsAppChange {
  field: string; // "messages"
  value: WhatsAppChangeValue;
}

export interface WhatsAppWebhookEntry {
  id: string; // WABA ID
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: string; // "whatsapp_business_account"
  entry?: WhatsAppWebhookEntry[];
}
