import crypto from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { env } from "../src/config/env.js";
import { WhatsAppClient } from "../src/integrations/whatsapp/client.js";
import { WhatsAppService } from "../src/integrations/whatsapp/service.js";
import { setCustomWhatsAppService } from "../src/routes/webhook.js";
import { MockAiProvider } from "../src/agents/mock-provider.js";
import express from "express";

describe("Milestone B: WhatsApp Cloud API & Webhook Integration", () => {
  let app: express.Express;
  let testBusiness: { id: string; name: string; timezone: string };
  let mockAi: MockAiProvider;
  let sentOutboundMessages: Array<{ to: string; text: string }> = [];

  const testAppSecret = "test_meta_app_secret_32bytes_len";
  const testPhoneId = "109876543210987";

  function signPayload(body: string, secret: string = testAppSecret): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(Buffer.from(body, "utf8"));
    return `sha256=${hmac.digest("hex")}`;
  }

  beforeAll(async () => {
    // Clean up
    await prisma.webhookInbox.deleteMany();
    await prisma.business.deleteMany({
      where: { slug: "wa-clinic-test" },
    });

    const biz = await prisma.business.create({
      data: {
        slug: "wa-clinic-test",
        name: "Dr. Robin's WhatsApp Clinic",
        timezone: "Asia/Kolkata",
        cancellationNoticeHours: 2,
        hours: {
          createMany: {
            data: [
              { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00" },
              { dayOfWeek: 2, openTime: "09:00", closeTime: "17:00" },
              { dayOfWeek: 3, openTime: "09:00", closeTime: "17:00" },
              { dayOfWeek: 4, openTime: "09:00", closeTime: "17:00" },
              { dayOfWeek: 5, openTime: "09:00", closeTime: "17:00" },
            ],
          },
        },
      },
    });

    testBusiness = { id: biz.id, name: biz.name, timezone: biz.timezone };

    await prisma.service.create({
      data: {
        businessId: testBusiness.id,
        name: "Pediatric Consultation",
        durationMinutes: 30,
        price: 600,
        currency: "INR",
        active: true,
      },
    });

    mockAi = new MockAiProvider();
    sentOutboundMessages = [];

    // Mock fetch for outbound WhatsApp client
    const mockFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      sentOutboundMessages.push({
        to: body.to,
        text: body.text?.body || "",
      });

      return {
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: "whatsapp",
          contacts: [{ input: body.to, wa_id: body.to }],
          messages: [{ id: `wamid.OUT_${Date.now()}` }],
        }),
      } as unknown as Response;
    };

    const mockWhatsAppClient = new WhatsAppClient({
      accessToken: "mock-token",
      phoneNumberId: testPhoneId,
      apiVersion: "v26.0",
      fetchFn: mockFetch,
    });

    const waService = new WhatsAppService(mockWhatsAppClient, mockAi);

    setCustomWhatsAppService(waService);
    app = createApp();
  });

  afterAll(async () => {
    setCustomWhatsAppService(null);
    await prisma.webhookInbox.deleteMany();
    await prisma.business.deleteMany({
      where: { slug: "wa-clinic-test" },
    });
  });

  describe("1. Webhook Verification & Security (GET & POST)", () => {
    it("echoes hub.challenge on valid GET verification", async () => {
      const res = await request(app)
        .get("/api/webhook/whatsapp")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": env.WHATSAPP_VERIFY_TOKEN,
          "hub.challenge": "challenge_token_abc123",
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe("challenge_token_abc123");
    });

    it("rejects GET verification with invalid verify token with 403", async () => {
      const res = await request(app)
        .get("/api/webhook/whatsapp")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong-token",
          "hub.challenge": "challenge_token_abc123",
        });

      expect(res.status).toBe(403);
    });

    it("rejects POST request when X-Hub-Signature-256 is missing", async () => {
      const res = await request(app)
        .post("/api/webhook/whatsapp")
        .send({ object: "whatsapp_business_account" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects POST request with tampered payload signature", async () => {
      const originalPayload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
      const signature = signPayload(originalPayload, env.WHATSAPP_APP_SECRET);

      const res = await request(app)
        .post("/api/webhook/whatsapp")
        .set("x-hub-signature-256", signature)
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ object: "tampered_data" }));

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("INVALID_SIGNATURE");
    });

    it("accepts validly signed POST webhook payload with 200", async () => {
      const payload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [],
      });
      const signature = signPayload(payload, env.WHATSAPP_APP_SECRET);

      const res = await request(app)
        .post("/api/webhook/whatsapp")
        .set("x-hub-signature-256", signature)
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("2. Durable Ingestion & Idempotent Deduplication", () => {
    it("processes an inbound WhatsApp text message and sends agent reply", async () => {
      sentOutboundMessages = [];
      const testWamid = `wamid.INBOUND_${Date.now()}_1`;
      const senderPhone = "+919876500001";

      mockAi.queueResponse({
        content: "Hello! Welcome to Dr. Robin's Clinic. How can I help you?",
        finishReason: "stop",
      });

      const payloadObj = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_123",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+15551234567",
                    phone_number_id: testPhoneId,
                  },
                  contacts: [
                    {
                      profile: { name: "Ravi Kumar" },
                      wa_id: senderPhone,
                    },
                  ],
                  messages: [
                    {
                      from: senderPhone,
                      id: testWamid,
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      type: "text",
                      text: {
                        body: "Hi, I would like to book a consultation.",
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawJson = JSON.stringify(payloadObj);
      const signature = signPayload(rawJson, env.WHATSAPP_APP_SECRET);

      const res = await request(app)
        .post("/api/webhook/whatsapp")
        .set("x-hub-signature-256", signature)
        .set("Content-Type", "application/json")
        .send(rawJson);

      expect(res.status).toBe(200);
      expect(res.body.result.processedMessages).toBe(1);

      // Verify inbox persistence
      const inbox = await prisma.webhookInbox.findUnique({
        where: { providerMessageId: testWamid },
      });
      expect(inbox).not.toBeNull();
      expect(inbox?.status).toBe("PROCESSED");

      // Verify customer auto-resolution
      const customer = await prisma.customer.findFirst({
        where: { phone: senderPhone },
      });
      expect(customer).not.toBeNull();
      expect(customer?.name).toBe("Ravi Kumar");

      // Verify outbound message was sent
      expect(sentOutboundMessages.length).toBe(1);
      expect(sentOutboundMessages[0]?.to).toBe(senderPhone);
      expect(sentOutboundMessages[0]?.text).toContain("Welcome to Dr. Robin's Clinic");
    });

    it("idempotently ignores duplicate webhook delivery with identical wamid", async () => {
      sentOutboundMessages = [];
      const duplicateWamid = `wamid.DUPE_${Date.now()}`;
      const senderPhone = "+919876500002";

      mockAi.queueResponse({
        content: "Here is your booking info.",
        finishReason: "stop",
      });

      const payloadObj = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_123",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+15551234567",
                    phone_number_id: testPhoneId,
                  },
                  contacts: [{ profile: { name: "Same Customer" }, wa_id: senderPhone }],
                  messages: [
                    {
                      from: senderPhone,
                      id: duplicateWamid,
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      type: "text",
                      text: { body: "First delivery" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawJson = JSON.stringify(payloadObj);
      const signature = signPayload(rawJson, env.WHATSAPP_APP_SECRET);

      // 1. First delivery
      const res1 = await request(app)
        .post("/api/webhook/whatsapp")
        .set("x-hub-signature-256", signature)
        .set("Content-Type", "application/json")
        .send(rawJson);

      expect(res1.status).toBe(200);
      expect(res1.body.result.processedMessages).toBe(1);
      expect(sentOutboundMessages.length).toBe(1);

      // 2. Immediate duplicate delivery from Meta
      const res2 = await request(app)
        .post("/api/webhook/whatsapp")
        .set("x-hub-signature-256", signature)
        .set("Content-Type", "application/json")
        .send(rawJson);

      expect(res2.status).toBe(200);
      expect(res2.body.result.duplicatesIgnored).toBe(1);
      expect(res2.body.result.processedMessages).toBe(0);
      // No duplicate outbound message was sent!
      expect(sentOutboundMessages.length).toBe(1);
    });

    it("updates message delivery status without creating new customer messages", async () => {
      const statusWamid = `wamid.STATUS_TEST_${Date.now()}`;

      // Create dummy outbound message
      const conv = await prisma.conversation.create({
        data: {
          businessId: testBusiness.id,
          tokenHash: "status-test",
        },
      });

      const msg = await prisma.message.create({
        data: {
          conversationId: conv.id,
          role: "ASSISTANT",
          content: "Your appointment is confirmed.",
          providerMessageId: statusWamid,
          status: "sent",
        },
      });

      const payloadObj = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_123",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+15551234567",
                    phone_number_id: testPhoneId,
                  },
                  statuses: [
                    {
                      id: statusWamid,
                      status: "delivered",
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      recipient_id: "+919876500001",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawJson = JSON.stringify(payloadObj);
      const signature = signPayload(rawJson, env.WHATSAPP_APP_SECRET);

      const res = await request(app)
        .post("/api/webhook/whatsapp")
        .set("x-hub-signature-256", signature)
        .set("Content-Type", "application/json")
        .send(rawJson);

      expect(res.status).toBe(200);
      expect(res.body.result.statusesUpdated).toBe(1);

      // Verify the message status was updated to delivered
      const updatedMsg = await prisma.message.findUnique({
        where: { id: msg.id },
      });
      expect(updatedMsg?.status).toBe("delivered");
    });
  });

  describe("3. Outbound WhatsApp Client Unit Invariants", () => {
    it("constructs official Graph API endpoint correctly", () => {
      const client = new WhatsAppClient({
        phoneNumberId: "123456789",
        apiVersion: "v26.0",
      });

      expect(client.getMessagesEndpoint()).toBe(
        "https://graph.facebook.com/v26.0/123456789/messages",
      );
    });

    it("normalizes HTTP 401/403 into AUTH_FAILED WhatsAppApiError", async () => {
      const failingFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: "Invalid OAuth token" } }),
        }) as unknown as Response;

      const client = new WhatsAppClient({
        fetchFn: failingFetch,
      });

      await expect(client.sendTextMessage("+919999999999", "Test")).rejects.toMatchObject({
        name: "WhatsAppApiError",
        code: "AUTH_FAILED",
        status: 401,
      });
    });

    it("normalizes timeouts into TIMEOUT WhatsAppApiError", async () => {
      const slowFetch: typeof fetch = async (_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      };

      const client = new WhatsAppClient({
        fetchFn: slowFetch,
        timeoutMs: 50,
      });

      await expect(client.sendTextMessage("+919999999999", "Test")).rejects.toMatchObject({
        name: "WhatsAppApiError",
        code: "TIMEOUT",
      });
    });
  });
});
