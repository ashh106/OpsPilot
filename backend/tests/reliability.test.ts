import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client.js";
import { AppointmentService } from "../src/services/appointment.service.js";
import { ConversationStateService } from "../src/services/conversation-state.service.js";
import { InboxWorker } from "../src/queue/inbox-worker.js";
import { WhatsAppService } from "../src/integrations/whatsapp/service.js";
import { WhatsAppClient } from "../src/integrations/whatsapp/client.js";
import { MockAiProvider } from "../src/agents/mock-provider.js";
import { ConversationWorkflowState, InboxStatus } from "@prisma/client";

describe("Milestone C: Reliable WhatsApp Processing & Persistent Conversation State", () => {
  let testBusiness: { id: string; name: string; timezone: string };
  let testService: { id: string; name: string; durationMinutes: number };
  let testCustomerA: { id: string; name: string; phone: string };
  let testCustomerB: { id: string; name: string; phone: string };
  let mockAi: MockAiProvider;
  const sentMessages: Array<{ to: string; text: string }> = [];

  beforeAll(async () => {
    await prisma.webhookInbox.deleteMany();
    await prisma.business.deleteMany({
      where: { slug: "rel-test-clinic" },
    });

    const biz = await prisma.business.create({
      data: {
        slug: "rel-test-clinic",
        name: "Dr. Robin's Reliability Clinic",
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

    const svc = await prisma.service.create({
      data: {
        businessId: testBusiness.id,
        name: "Standard Consultation",
        durationMinutes: 30,
        price: 500,
        currency: "INR",
        active: true,
      },
    });

    testService = { id: svc.id, name: svc.name, durationMinutes: svc.durationMinutes };

    const custA = await prisma.customer.create({
      data: {
        businessId: testBusiness.id,
        name: "Alice Walker",
        phone: "+919876543210",
      },
    });
    testCustomerA = { id: custA.id, name: custA.name, phone: custA.phone! };

    const custB = await prisma.customer.create({
      data: {
        businessId: testBusiness.id,
        name: "Bob Singer",
        phone: "+919876543211",
      },
    });
    testCustomerB = { id: custB.id, name: custB.name, phone: custB.phone! };

    mockAi = new MockAiProvider();
  });

  afterAll(async () => {
    await prisma.webhookInbox.deleteMany();
    await prisma.business.deleteMany({
      where: { slug: "rel-test-clinic" },
    });
  });

  describe("1. Booking Idempotency & Crash Recovery", () => {
    it("recovers existing appointment on duplicate execution with same idempotencyKey", async () => {
      const idempotencyKey = `idemp_test_${Date.now()}`;
      const startTime = "2026-11-09T04:30:00.000Z"; // 10:00 AM IST

      // 1. First execution creates appointment
      const appt1 = await AppointmentService.createAppointment({
        businessId: testBusiness.id,
        serviceId: testService.id,
        startTime,
        customerId: testCustomerA.id,
        idempotencyKey,
      });

      expect(appt1.id).toBeDefined();

      // 2. Worker crash / retry: re-running with same idempotencyKey returns existing appointment
      const appt2 = await AppointmentService.createAppointment({
        businessId: testBusiness.id,
        serviceId: testService.id,
        startTime,
        customerId: testCustomerA.id,
        idempotencyKey,
      });

      expect(appt2.id).toBe(appt1.id);

      // Verify only ONE appointment exists in database
      const count = await prisma.appointment.count({
        where: { idempotencyKey },
      });
      expect(count).toBe(1);
    });

    it("prevents duplicate bookings under concurrent creation races", async () => {
      const idempotencyKey = `race_key_${Date.now()}`;
      const startTime = "2026-11-09T05:30:00.000Z"; // 11:00 AM IST

      // Run 3 concurrent creations with identical idempotencyKey
      const results = await Promise.all([
        AppointmentService.createAppointment({
          businessId: testBusiness.id,
          serviceId: testService.id,
          startTime,
          customerId: testCustomerA.id,
          idempotencyKey,
        }),
        AppointmentService.createAppointment({
          businessId: testBusiness.id,
          serviceId: testService.id,
          startTime,
          customerId: testCustomerA.id,
          idempotencyKey,
        }),
        AppointmentService.createAppointment({
          businessId: testBusiness.id,
          serviceId: testService.id,
          startTime,
          customerId: testCustomerA.id,
          idempotencyKey,
        }),
      ]);

      // All 3 concurrent calls returned the exact same appointment ID
      expect(results[0]?.id).toBe(results[1]?.id);
      expect(results[1]?.id).toBe(results[2]?.id);

      const count = await prisma.appointment.count({
        where: { idempotencyKey },
      });
      expect(count).toBe(1);
    });
  });

  describe("2. PostgreSQL-Backed Asynchronous Inbox Worker", () => {
    it("atomically claims pending jobs and executes them via FOR UPDATE SKIP LOCKED", async () => {
      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        sentMessages.push({ to: body.to, text: body.text?.body });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: "whatsapp",
            messages: [{ id: `wamid.OUT_${Date.now()}` }],
          }),
        } as unknown as Response;
      };

      const client = new WhatsAppClient({ fetchFn: mockFetch });
      const waService = new WhatsAppService(client, mockAi);
      const worker = new InboxWorker(waService, "worker_test_1");

      const wamid = `wamid.ASYNC_${Date.now()}`;
      // Manually insert pending event
      await prisma.webhookInbox.create({
        data: {
          provider: "whatsapp",
          providerMessageId: wamid,
          eventType: "message",
          businessId: testBusiness.id,
          payload: {
            from: testCustomerA.phone,
            id: wamid,
            type: "text",
            text: { body: "Hello from async worker test" },
          },
          status: InboxStatus.PENDING,
        },
      });

      mockAi.queueResponse({
        content: "Hello Alice, async worker successfully reached me!",
        finishReason: "stop",
      });

      // Claim and process
      const didProcess = await worker.processNext();
      expect(didProcess).toBe(true);

      // Verify job marked PROCESSED
      const record = await prisma.webhookInbox.findUnique({
        where: { providerMessageId: wamid },
      });
      expect(record?.status).toBe(InboxStatus.PROCESSED);
      expect(record?.attempts).toBe(1);
      expect(record?.lockedAt).toBeNull();
    });

    it("applies exponential backoff on failure and stops at max attempts", async () => {
      // Create a failing service
      const failingService = new WhatsAppService();
      failingService.processInboundMessageDirectly = async () => {
        throw new Error("Simulated transient network failure");
      };

      const worker = new InboxWorker(failingService, "worker_failing", 3);
      const wamid = `wamid.FAIL_${Date.now()}`;

      await prisma.webhookInbox.create({
        data: {
          provider: "whatsapp",
          providerMessageId: wamid,
          eventType: "message",
          businessId: testBusiness.id,
          payload: {
            from: testCustomerA.phone,
            id: wamid,
            type: "text",
            text: { body: "Fail me" },
          },
          status: InboxStatus.PENDING,
          attempts: 2, // Next attempt will be 3 (maxAttempts)
        },
      });

      const didProcess = await worker.processNext();
      expect(didProcess).toBe(false);

      const record = await prisma.webhookInbox.findUnique({
        where: { providerMessageId: wamid },
      });
      // Reached maxAttempts -> terminal failure
      expect(record?.status).toBe(InboxStatus.FAILED);
      expect(record?.lastError).toContain("Simulated transient network failure");
    });
  });

  describe("3. Persistent Conversation State Machine", () => {
    it("proposes a booking and transitions conversation to AWAITING_CONFIRMATION", async () => {
      const conv = await prisma.conversation.create({
        data: {
          businessId: testBusiness.id,
          customerId: testCustomerA.id,
          tokenHash: "state-test-1",
        },
      });

      const startTime = "2026-11-09T06:30:00.000Z"; // 12:00 PM IST
      const proposed = await ConversationStateService.proposeBooking(
        conv.id,
        {
          serviceId: testService.id,
          serviceName: testService.name,
          startTime,
          customerName: testCustomerA.name,
          customerPhone: testCustomerA.phone,
        },
        15, // 15 min TTL
      );

      expect(proposed).toBe(true);

      const state = await ConversationStateService.getConversationState(conv.id);
      expect(state?.state).toBe(ConversationWorkflowState.AWAITING_CONFIRMATION);
      expect(state?.proposal?.action).toBe("BOOK");
      expect(state?.proposal?.serviceId).toBe(testService.id);
    });

    it("confirms pending booking when customer replies 'yes'", async () => {
      const conv = await prisma.conversation.create({
        data: {
          businessId: testBusiness.id,
          customerId: testCustomerA.id,
          tokenHash: "state-test-confirm",
        },
      });

      const startTime = "2026-11-09T07:30:00.000Z"; // 1:00 PM IST
      await ConversationStateService.proposeBooking(conv.id, {
        serviceId: testService.id,
        serviceName: testService.name,
        startTime,
        customerName: testCustomerA.name,
        customerPhone: testCustomerA.phone,
      });

      // Customer confirms
      const outcome = await ConversationStateService.handleConfirmation({
        conversationId: conv.id,
        customerMessage: "Yes, please confirm that time slot.",
        businessId: testBusiness.id,
        customerId: testCustomerA.id,
      });

      expect(outcome?.handled).toBe(true);
      expect(outcome?.actionTaken).toBe("BOOKED");
      expect(outcome?.reply).toContain("confirmed");

      // Verify appointment was created in DB
      const appt = await prisma.appointment.findUnique({
        where: { id: outcome?.appointmentId },
      });
      expect(appt).not.toBeNull();
      expect(appt?.customerId).toBe(testCustomerA.id);

      // Verify conversation transitioned to BOOKED
      const state = await ConversationStateService.getConversationState(conv.id);
      expect(state?.state).toBe(ConversationWorkflowState.BOOKED);
      expect(state?.proposal).toBeNull();
    });

    it("aborts proposal when customer replies 'no'", async () => {
      const conv = await prisma.conversation.create({
        data: {
          businessId: testBusiness.id,
          customerId: testCustomerA.id,
          tokenHash: "state-test-abort",
        },
      });

      const startTime = "2026-11-09T08:30:00.000Z";
      await ConversationStateService.proposeBooking(conv.id, {
        serviceId: testService.id,
        serviceName: testService.name,
        startTime,
        customerName: testCustomerA.name,
        customerPhone: testCustomerA.phone,
      });

      const outcome = await ConversationStateService.handleConfirmation({
        conversationId: conv.id,
        customerMessage: "No, cancel that request please",
        businessId: testBusiness.id,
        customerId: testCustomerA.id,
      });

      expect(outcome?.handled).toBe(true);
      expect(outcome?.actionTaken).toBe("ABORTED");

      const state = await ConversationStateService.getConversationState(conv.id);
      expect(state?.state).toBe(ConversationWorkflowState.IDLE);
      expect(state?.proposal).toBeNull();
    });

    it("rejects confirmation if proposal TTL has expired", async () => {
      const conv = await prisma.conversation.create({
        data: {
          businessId: testBusiness.id,
          customerId: testCustomerA.id,
          tokenHash: "state-test-expired",
        },
      });

      // Propose with negative TTL (already expired)
      await ConversationStateService.proposeBooking(
        conv.id,
        {
          serviceId: testService.id,
          serviceName: testService.name,
          startTime: "2026-11-09T09:30:00.000Z",
          customerName: testCustomerA.name,
        },
        -5, // expired 5 minutes ago
      );

      const outcome = await ConversationStateService.handleConfirmation({
        conversationId: conv.id,
        customerMessage: "Yes please",
        businessId: testBusiness.id,
        customerId: testCustomerA.id,
      });

      expect(outcome?.handled).toBe(true);
      expect(outcome?.actionTaken).toBe("EXPIRED");
      expect(outcome?.reply).toContain("expired");

      const state = await ConversationStateService.getConversationState(conv.id);
      expect(state?.state).toBe(ConversationWorkflowState.IDLE);
    });

    it("prevents customer B from rescheduling or cancelling customer A's appointment", async () => {
      // 1. Create appointment for Customer A
      const apptA = await AppointmentService.createAppointment({
        businessId: testBusiness.id,
        serviceId: testService.id,
        startTime: "2026-11-10T04:30:00.000Z",
        customerId: testCustomerA.id,
      });

      const convB = await prisma.conversation.create({
        data: {
          businessId: testBusiness.id,
          customerId: testCustomerB.id,
          tokenHash: "state-test-security-b",
          workflowState: ConversationWorkflowState.CANCELLING,
          pendingProposal: {
            action: "CANCEL",
            appointmentId: apptA.id,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        },
      });

      // Customer B attempts to confirm cancellation of Customer A's appointment
      const outcome = await ConversationStateService.handleConfirmation({
        conversationId: convB.id,
        customerMessage: "Yes, cancel it",
        businessId: testBusiness.id,
        customerId: testCustomerB.id, // Customer B!
      });

      expect(outcome?.handled).toBe(true);
      expect(outcome?.reply).toContain("permission");

      // Verify Customer A's appointment is still CONFIRMED
      const freshAppt = await prisma.appointment.findUnique({
        where: { id: apptA.id },
      });
      expect(freshAppt?.status).toBe("CONFIRMED");
    });
  });
});
